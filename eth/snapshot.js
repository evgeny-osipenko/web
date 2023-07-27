const addressRe = /^0[xX][0-9a-fA-F]{40}$/

const addressTopicRe = /^0[xX]0{24}([0-9a-fA-F]{40})$/

const responseSizeExceededRe = /\[\s*(0x[0-9a-fA-F]+)\s*\,\s*(0x[0-9a-fA-F]+)\s*\]/

const nullAddress = '0x0000000000000000000000000000000000000000'

function updateSnapshotTimePreview() {
    const snapshottimeInput = document.getElementById('snapshottime')
    const snapshottimepreview = document.getElementById('snapshottimepreview')
    const snapshotTimestamp = (new Date(snapshottimeInput.value)).getTime()
    if (snapshotTimestamp > 0) {
        snapshottimepreview.innerText = snapshotTimestamp.toString() + ' ' + (new Date(snapshotTimestamp)).toString()
    } else {
        snapshottimepreview.innerText = ''
    }
}

async function doSnapshot(button) {
    const contractaddressInput = document.getElementById('contractaddress')
    const snapshottimeInput = document.getElementById('snapshottime')
    const statuswindow = document.getElementById('statuswindow')
    const resultanchor = document.getElementById('resultanchor')
    contractaddressInput.disabled = true
    snapshottimeInput.disabled = true
    button.disabled = true
    statuswindow.style.color = ''
    statuswindow.innerHTML = ''
    resultanchor.style.visibility = 'hidden'
    try {
        if (!window.ethereum) {
            throw 'No ethereum wallet available'
        }
        const contractAddress = contractaddressInput.value
        if (!addressRe.test(contractAddress)) {
            throw 'Invalid address'
        }
        const snapshotTimestamp = (new Date(snapshottimeInput.value)).getTime()
        if (!(snapshotTimestamp > 0)) {
            throw 'Invalid snapshot time'
        }
        statuswindow.innerText = 'Retrieving current block number...'
        const currentBlockNumber = Number(await window.ethereum.request({
            method: 'eth_blockNumber',
            params: [],
        }))
        const deploymentBlockNumber = await getContractDeploymentBlockNumber(contractAddress, currentBlockNumber)
        const contractType = await determineContractType(contractAddress)
        const snapshotBlockNumber = await getBlockNumberAtTimestamp(snapshotTimestamp)
        if (contractType == 721) {
            const dist = await get721DistributionFromAt(
                contractAddress, deploymentBlockNumber, snapshotBlockNumber,
            )
            const [distTable, distDataUrl] = serialize721Distribution(dist)
            statuswindow.innerHTML = ''
            resultanchor.download = '721_' + contractAddress + '_' + snapshotTimestamp + '.csv'
            resultanchor.href = distDataUrl
            resultanchor.style.visibility = ''
            statuswindow.appendChild(distTable)
        }
    } catch (ex) {
        statuswindow.style.color = 'red'
        if (ex.data?.error?.message) {
            statuswindow.innerText =
                ex.message + ': [' + ex.data.error.code + '] ' + ex.data.error.message
        } else if (ex.data?.message) {
            statuswindow.innerText =
                ex.message + ': [' + ex.data.code + '] ' + ex.data.message
        } else if (ex.message) {
            statuswindow.innerText = ex.message
        } else {
            statuswindow.innerText = ex
        }
    }
    contractaddressInput.disabled = false
    snapshottimeInput.disabled = false
    button.disabled = false
}

async function getContractDeploymentBlockNumber(contractAddress, currentBlockNumber) {
    let earliest = 0
    let latest = currentBlockNumber
    while (earliest < latest) {
        statuswindow.innerText =
            `Determining the contract deployment block... (${Math.log2(latest - earliest) | 0})`
        const candidate = ((earliest + latest) / 2) | 0
        const code = await window.ethereum.request({
            method: 'eth_getCode',
            params: [contractAddress, numberToHex(candidate)],
        })
        if (code != '0x') {
            latest = candidate
        } else {
            earliest = candidate + 1
        }
    }
    return earliest
}

async function getBlockByNumber(number) {
    let block = await window.ethereum.request({
        method: 'eth_getBlockByNumber',
        params: [isNaN(number) ? number : numberToHex(number), false],
    })
    block.number = Number(block.number)
    block.timestamp = Number(block.timestamp) * 1000
    return block
}

async function getBlockNumberAtTimestamp(desiredTimestamp) {
    let beforeBlock = await getBlockByNumber(0)
    let afterBlock = await getBlockByNumber('latest')
    if (afterBlock.timestamp <= desiredTimestamp) {
        return afterBlock
    } else if (beforeBlock.timestamp > desiredTimestamp) {
        throw 'Snapshot time is before blockchain genesis'
    }
    while (afterBlock.number - beforeBlock.number > 1) {
        statuswindow.innerText =
            `Determining the snapshot block... (${Math.log10(afterBlock.number - beforeBlock.number) | 0})`
        let estimateFraction = (
            (desiredTimestamp - beforeBlock.timestamp) /
            (afterBlock.timestamp - beforeBlock.timestamp)
        )
        if (estimateFraction > 0.95) {
            estimateFraction = 0.95
        } else if (estimateFraction < 0.05) {
            estimateFraction = 0.05
        }
        let estimateBlockNumber = (
            beforeBlock.number +
            estimateFraction * (afterBlock.number - beforeBlock.number)
        ) | 0
        if (estimateBlockNumber <= beforeBlock.number) {
            estimateBlockNumber = beforeBlock.number + 1
        } else if (estimateBlockNumber >= afterBlock.number) {
            estimateBlockNumber = afterBlock.number - 1
        }
        const estimateBlock = await getBlockByNumber(estimateBlockNumber)
        if (estimateBlock.timestamp < desiredTimestamp) {
            beforeBlock = estimateBlock
        } else {
            afterBlock = estimateBlock
        }
    }
    return beforeBlock.number
}

async function determineContractType(contractAddress) {
    statuswindow.innerText = 'Determining contract type...'
    const isERC721 = await window.ethereum.request({
        method: 'eth_call',
        params: [{
            'to': contractAddress,
            'data': '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
        }],
    })
    if (isERC721 == '0x0000000000000000000000000000000000000000000000000000000000000001') {
        return 721
    }
    throw 'Unknown contract type (not ERC-721)'
}

async function get721DistributionFromAt(contractAddress, deploymentBlockNumber, snapshotBlockNumber) {
    const maxIncreaseFactor = 1.2
    let currentBlock = deploymentBlockNumber
    let state = {}
    let chunkSize = 1000
    let startTime = Date.now()
    while (currentBlock <= snapshotBlockNumber) {
        const blocksLeft = snapshotBlockNumber - currentBlock + 1
        const blocksProcessed = currentBlock - deploymentBlockNumber
        const deltaTime = Date.now() - startTime
        const msPerBlock = deltaTime / blocksProcessed
        const msEstimate = blocksLeft * msPerBlock
        statuswindow.innerText =
            `Processing logs... (${blocksLeft})\nETA: ${msToTimeString(msEstimate)}`
        let toBlock = currentBlock + chunkSize - 1
        if (toBlock > snapshotBlockNumber) {
            toBlock = snapshotBlockNumber
        }
        const [beforeNextBlock, logs] = await getTransferEvents(
            contractAddress, currentBlock, toBlock,
        )
        for (const entry of logs) {
            const addressMatch = addressTopicRe.exec(entry.topics[2])
            const toAddress = '0x' + addressMatch[1]
            const id = Number(entry.topics[3])
            state[id] = toAddress
        }
        chunkSize = beforeNextBlock - currentBlock + 1
        let fillFraction = logs.length / 100
        if (fillFraction < 1/maxIncreaseFactor) {
            chunkSize = (chunkSize * maxIncreaseFactor) | 0
        } else {
            chunkSize = (chunkSize / fillFraction) | 0
        }
        if (chunkSize < 100) {
            chunkSize = 100
        }
        currentBlock = beforeNextBlock + 1
    }
    return state
}

async function getTransferEvents(contractAddress, fromBlock, toBlock) {
    while (true) {
        try {
            const logs = await window.ethereum.request({
                method: 'eth_getLogs',
                params: [{
                    'fromBlock': numberToHex(fromBlock),
                    'toBlock': numberToHex(toBlock),
                    'address': contractAddress,
                    'topics': ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']
                }],
            })
            return [toBlock, logs]
        } catch (ex) {
            console.log('shit crypto', ex)
            if (ex.data?.message) {
                let match = responseSizeExceededRe.exec(ex.data.message)
                if (match) {
                    toBlock = Number(match[2])
                    continue
                }
            }
            throw ex
        }
    }
}

function serialize721Distribution(dist) {
    let elems = []
    for (const k in dist) {
        if (dist[k] != nullAddress) {
            elems.push([k, dist[k]])
        }
    }
    elems.sort((a, b) => a[0] - b[0])
    let csvLines = elems.map(x => '\n' + x[0].toString() + ',"' + x[1] + '"')
    let table = document.createElement('table')
    table.className = 'dist-table'
    let thead = table.appendChild(document.createElement('thead'))
    thead.innerHTML = '<tr><td class="id-header">NFT id</td><td class="address-header">Owner address</td></tr>'
    let tbody = table.appendChild(document.createElement('tbody'))
    for (const x of elems) {
        let tr = tbody.appendChild(document.createElement('tr'))
        let td1 = tr.appendChild(document.createElement('td'))
        td1.className = 'id-cell'
        td1.innerText = x[0].toString()
        let td2 = tr.appendChild(document.createElement('td'))
        td2.className = 'address-cell'
        td2.innerText = x[1]
    }
    return [
        table,
        'data:text/csv;base64,' + btoa('"id","address"' + csvLines.join('')),
    ]
}

function msToTimeString(time) {
    const s = (Math.floor(time / 1000) % 60)
    const m = (Math.floor(time / 60000) % 60)
    const h = (Math.floor(time / 3600000) % 60)
    let str = s.toString()
    if (time >= 60000) {
        str = m.toString() + ':' + str.padStart(2, '0')
    }
    if (time >= 3600000) {
        str = h.toString() + ':' + str.padStart(5, '0')
    }
    return str
}

function numberToHex(n) {
    return '0x' + (n | 0).toString(16)
}
