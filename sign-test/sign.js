async function doSign(button) {
    let primtypeInput = document.getElementById("primtype")
    let tokenidInput = document.getElementById("tokenid")
    let nonceInput = document.getElementById("nonce")
    let outputTA = document.getElementById("output")
    button.disabled = true
    try {
        let eth = window.ethereum
        if (!eth) {
            throw "No ethereum wallet available"
        }
        let addressList = await eth.request({
                method: 'eth_requestAccounts',
                params: [],
            })
        let address = addressList[0]
        if (!address) {
            throw "No address"
        }
        const message = JSON.stringify(heroTokenMessage(
            primtypeInput.value,
            tokenidInput.value,
            nonceInput.value
        ));
        let signature = await eth.request({
                method: 'eth_signTypedData_v4',
                params: [address, message],
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

function heroTokenMessage(primType, tokenId, nonce) {
    return {
        domain: {
            name: 'HeroesToken',
            version: '1',
            chainId: 80001, // 0x13881
            verifyingContract: '0x424139b19210f1de80b41E80f36D82b878fAd107',
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
