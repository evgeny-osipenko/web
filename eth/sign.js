async function doSign(button) {
    const primtypeInput = document.getElementById("primtype")
    const contractaddressInput = document.getElementById("contractaddress")
    const tokenidInput = document.getElementById("tokenid")
    const outputTA = document.getElementById("output")
    button.disabled = true
    try {
        const eth = window.ethereum
        if (!eth) {
            throw "No ethereum wallet available"
        }
        const addressList = await eth.request({
            method: 'eth_requestAccounts',
            params: [],
        })
        const address = addressList[0]
        if (!address) {
            throw "No address"
        }
        const nftNonce = await eth.request({
            method: 'eth_call',
            params: [
                {
                    "to": contractaddressInput.value,
                    "data":
                        "0x12f1dbc8" +
                        numberToHex256(Number(tokenidInput.value)),
                },
                "latest",
            ],
        })
        const messageJson = heroTokenMessage(
            primtypeInput.value,
            contractaddressInput.value,
            tokenidInput.value,
            Number(nftNonce) + 1
        )
        console.log(messageJson)
        const signature = await eth.request({
            method: 'eth_signTypedData_v4',
            params: [address, JSON.stringify(messageJson)],
        })
        outputTA.innerText = signature
    } catch (ex) {
        if (ex.message) {
            window.alert(ex.message)
        } else {
            window.alert(ex)
        }
    }
    button.disabled = false
}

function heroTokenMessage(primType, contractAddress, tokenId, nonce) {
    return {
        domain: {
            name: 'HeroesToken',
            version: '1',
            chainId: 80001, // 0x13881
            verifyingContract: contractAddress,
        },
        message: {
            tokenId: tokenId,
            nonce: nonce,
        },
        primaryType: primType,
        types: {
            EIP712Domain: [
                { type: 'string', name: 'name' },
                { type: 'string', name: 'version' },
                { type: 'uint256', name: 'chainId' },
                { type: 'address', name: 'verifyingContract' },
            ],
            stake: [
                { type: 'uint256', name: 'tokenId' },
                { type: 'uint256', name: 'nonce' },
            ],
            unstake: [
                { type: 'uint256', name: 'tokenId' },
                { type: 'uint256', name: 'nonce' },
            ],
            requestToUnstake: [
                { type: 'uint256', name: 'tokenId' },
                { type: 'uint256', name: 'nonce' },
            ],
        },
    }
}

function strToUtf8Hex(str) {
    let u8bytes = new TextEncoder().encode(str)
    return '0x' + byteArrayHex(u8bytes)
}

function byteArrayHex(bytes) {
    return Array.from(bytes).map(byteToHex).join('')
}

function byteToHex(b) {
    let s = b.toString(16)
    if (b < 16) {
        return '0' + s
    } else {
        return s
    }
}

function numberToHex256(x) {
    if (!(x > 0)) {
        x = 0
    }
    let buf = ''
    for (let i = 0; i < 64; ++i) {
        let d = x % 16
        if (d < 10) {
            buf = String.fromCharCode(48 + d) + buf
        } else {
            buf = String.fromCharCode(87 + d) + buf
        }
        x = (x - d) / 16
    }
    return buf
}
