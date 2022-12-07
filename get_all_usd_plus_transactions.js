import fetch from 'node-fetch';
import fs from 'fs';
import * as dotenv from 'dotenv';
import Web3 from 'web3';

dotenv.config();

const web3 = new Web3('https://bsc-dataseed.binance.org/');

const LP_ADDRESSES = [
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816',
    '0xec30da6361905b8f3e4a93513d937db992301276',
    '0x0f8c95890b7bdecfae7990bf32f22120111e0b44',
    '0x30f96ad4856d7e699963b589591f03710976a6e8',
    '0xcaa926480d998522beb3ded06d4ee367fba4eaad',
    '0xdee33737634bb7612c15b10488819e88fd62f0f9',
    '0xd24c3ae86bd009d1de3550e378897a7f126647d1',
    '0xb0b693879e41cb28aed63b134bef16f5543e9598',
    '0x41a77bd568008dc6fe745db6f5bedb7663d5ee08',
    '0x82ef7b01bc81117c86c82f4597ab032e39c46c61',
    '0x977bc1f72e41e9072b2e219f034ebe63c54fffe5',
];

// Gets all the transactions involving USD+ being transferred by querying the USD+ "transfer" events between two blocks.
fetch('https://api.bscscan.com/api?module=logs&action=getLogs&fromBlock=22720066&toBlock=22742225&address=0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65&topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef&apikey=' + process.env.BSC_SCAN_API_KEY, {
    method: 'GET',
    headers: {
        'Accept': 'application/json',
    },
})
.then(response => response.json())
.then(obj => printTransactionsToCSV(obj));

// Global variable to make our lives easier for transaction that have a USD+ transfer that is a sell fee.
let nextTransactionIsSellFee = false;

// Global variables to make our lives easier for REIGN protocol transactions.
let reignBuy = '';
let reignSell = '';

// Prints all the transactions that involve USD+ being transferred in a CSV file.
async function printTransactionsToCSV(response) {
    let transactions = [];

    for (let i = 0; i < response.result.length; i++) {
        transactions.push(await processTransaction(response.result[i]));
    }

    let content = 'BscScan Link,Transaction Hash,From Address,To Address,Amount,Block Number,Transaction Index,From Address Dollar Value Change,To Address Dollar Value Change,Comment\n';
    for (let i = 0; i < response.result.length; i++) {
        content += transactions[i];
    }
    fs.writeFile('all_usd_plus_transactions.csv', content, err => {
        if (err) {
            console.error(err);
        }
    });
}

// Processes a single transaction involving USD+ being transferred, and returns the corresponding info as a CSV row.
async function processTransaction(result) {
    // First add basic info about the transaction.
    const fromAddress = fixAddress(result.topics[1]);
    const toAddress = fixAddress(result.topics[2]);
    const amount = (BigInt(result.data) * BigInt(1000000000000)).toString(10);

    let row = 'https://bscscan.com/tx/' + result.transactionHash + ',';
    row += result.transactionHash + ',';
    row += fromAddress + ',';
    row += toAddress + ',';
    row += amount + ',';
    row += BigInt(result.blockNumber).toString(10) + ',';
    let txnIndex = result.transactionIndex;
    if (txnIndex == '0x') {
        txnIndex = 0;
    } else {
        txnIndex = BigInt(txnIndex).toString(10);
    }
    row += txnIndex + ',';

    // And now try to understand what type of transaction it is and add the corresponding info.
    const txn = await web3.eth.getTransaction(result.transactionHash);

    // This is a regular transfer transaction.
    // 0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65 is the USD+ contract
    // 0xa9059cbb is the transfer(address,uint256) function selector
    // 0x23b872dd is the transferFrom(address,address,uint256) function selector
    if (txn.to == '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65' &&
        (
            txn.input.startsWith('0xa9059cbb') ||
            txn.input.startsWith('0x23b872dd')
        )) {
        row +=  '-' + amount + ',' + amount + ',Transferred USD+\n';
    }

    // This is a transaction where someone is removing their LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0x0dede6c4 is the removeLiquidity(address,address,bool,uint256,uint256,uint256,address,uint256) function selector
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' && txn.input.startsWith('0x0dede6c4')) {
        row += '0,' + amount + ',Removed USD+ liquidity\n';
    }

    // This is a transaction where someone is selling USD+ to BUSD through the USD+/BUSD LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract
    // 1 means this is a Cone stable pool
    // 0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816 is the USD+/BUSD LP contract
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 586 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(482, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(585, 1) == '1') {
        if (toAddress == '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816') {
            let printed = false;
            const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
            for (let i = 0; i < receipt.logs.length; i++) {
                if (receipt.logs[i].address == '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56') {
                    if (printed) {
                        console.error('Txn ' + result.transactionHash + ' printed more than once!');
                    }
                    row += '-' + BigInt(receipt.logs[i].data).toString(10) + ',0,Sold USD+\n';
                    printed = true;
                }
            }
            if (!printed) {
                console.error('Txn ' + result.transactionHash + ' never printed!');
            }
        } else if (fromAddress == '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816') {
            row += '0,' + amount + ',Removed USD+ liquidity\n';
        } else {
            console.error('Txn ' + result.transactionHash + ' contains an unexpected transfer!');
        }
    }

    // This is a transaction where someone is selling USD+ to TETU through the TETU/USD+ LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // 1f681b1c4065057e07b95a1e5e504fb2c85f4625 is the TETU contract
    // 0 means this is a Cone volatile pool
    // 0x0f8c95890b7bdecfae7990bf32f22120111e0b44 is the TETU/USD+ LP contract
    // 1705 / 100000 is the dollar price of TETU
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 586 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(482, 40) == '1f681b1c4065057e07b95a1e5e504fb2c85f4625' &&
             txn.input.substr(585, 1) == '0') {
        if (toAddress == '0x0f8c95890b7bdecfae7990bf32f22120111e0b44') {
            let printed = false;
            const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
            for (let i = 0; i < receipt.logs.length; i++) {
                if (receipt.logs[i].address == '0x1f681B1c4065057E07b95a1E5e504fB2c85F4625') {
                    if (printed) {
                        console.error('Txn ' + result.transactionHash + ' printed more than once!');
                    }
                    row += '-' + (BigInt(receipt.logs[i].data) * BigInt(1705) / BigInt(100000)).toString(10) + ',0,Sold USD+\n';
                    printed = true;
                }
            }
            if (!printed) {
                console.error('Txn ' + result.transactionHash + ' never printed!');
            }
        } else if (fromAddress == '0x0f8c95890b7bdecfae7990bf32f22120111e0b44') {
            row += '0,' + amount + ',Removed USD+ liquidity\n';
        } else {
            console.error('Txn ' + result.transactionHash + ' contains an unexpected transfer!');
        }
    }

    // This is a transaction where someone is selling USD+ to USDT through the USD+/BUSD LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract
    // 55d398326f99059ff775485246999027b3197955 is the USDT contract
    // 1 means this is a Cone stable pool
    // 0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816 is the USD+/BUSD LP contract
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 778 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(482, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(674, 40) == '55d398326f99059ff775485246999027b3197955' &&
             txn.input.substr(585, 1) == '1' &&
             txn.input.substr(777, 1) == '1') {
        if (toAddress == '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816') {
            let printed = false;
            const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
            for (let i = 0; i < receipt.logs.length; i++) {
                if (receipt.logs[i].address == '0x55d398326f99059fF775485246999027B3197955') {
                    if (printed) {
                        console.error('Txn ' + result.transactionHash + ' printed more than once!');
                    }
                    row += '-' + BigInt(receipt.logs[i].data).toString(10) + ',0,Sold USD+\n';
                    printed = true;
                }
            }
            if (!printed) {
                console.error('Txn ' + result.transactionHash + ' never printed!');
            }
        } else if (fromAddress == '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816') {
            row += '0,' + amount + ',Removed USD+ liquidity\n';
        } else {
            console.error('Txn ' + result.transactionHash + ' contains an unexpected transfer!');
        }
    }

    // This is a transaction where someone is selling USD+ to BUSD through the WBNB/USD+ LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c is the WBNB contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract
    // 0 means this is a Cone volatile pool
    // 0xec30da6361905b8f3e4a93513d937db992301276 is the WBNB/USD+ LP contract
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 778 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(482, 40) == 'bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' &&
             txn.input.substr(674, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(585, 1) == '0' &&
             txn.input.substr(777, 1) == '0') {
        if (toAddress == '0xec30da6361905b8f3e4a93513d937db992301276') {
            let printed = false;
            const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
            for (let i = 0; i < receipt.logs.length; i++) {
                if (receipt.logs[i].address == '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56') {
                    if (printed) {
                        console.error('Txn ' + result.transactionHash + ' printed more than once!');
                    }
                    row += '-' + BigInt(receipt.logs[i].data).toString(10) + ',0,Sold USD+\n';
                    printed = true;
                }
            }
            if (!printed) {
                console.error('Txn ' + result.transactionHash + ' never printed!');
            }
        } else if (fromAddress == '0xec30da6361905b8f3e4a93513d937db992301276') {
            row += '0,' + amount + ',Removed USD+ liquidity\n';
        } else {
            console.error('Txn ' + result.transactionHash + ' contains an unexpected transfer!');
        }
    }

    // This is a transaction where someone is selling USD+ to BUSD through the MetaMask router through the USD+/BUSD LP.
    // 0x1a1ec25DC08e98e5E93F1104B5e5cdD298707d31 is the MetaMask Router contract
    // 0x5f575529 is the swap(string,address,uint256,bytes) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract  
    else if (txn.to == '0x1a1ec25DC08e98e5E93F1104B5e5cdD298707d31' &&
             txn.input.startsWith('0x5f575529') &&
             txn.input.length == 3466 &&
             txn.input.substr(98, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(482, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(1258, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(2050, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(2510, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(2574, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(2722, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(3182, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56') {
        if (fromAddress == txn.from.toLowerCase()) {
            let printed = false;
            let usdPlusTransfers = 0;
            let busdTransfers = 0;
            const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
            for (let i = 0; i < receipt.logs.length; i++) {
                if (receipt.logs[i].address == '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' &&
                    receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    busdTransfers++;
                    if (!printed) {
                        row += '-' + BigInt(receipt.logs[i].data).toString(10) + ',0,Sold USD+\n';
                        printed = true;
                    }
                } else if (receipt.logs[i].address == '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65' &&
                           receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    usdPlusTransfers++;
                }
            }
            if (!printed) {
                console.error('Txn ' + result.transactionHash + ' never printed!');
            }
            if (usdPlusTransfers != 4 || busdTransfers != 2) {
                console.error('Txn ' + result.transactionHash + ' contains an unexpected number of transfers!');
            }
        } else if (fromAddress == '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816') {
            row += '0,' + amount + ',Removed USD+ liquidity\n';
        } else {
            row += '0,0,Internal LP transfer\n';
        }
    }

    // This is a transaction where someone is buying USD+ using BUSD through the USD+/BUSD LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract
    // 1 means this is a Cone stable pool
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the Transfer(address indexed from, address indexed to, uint256 value) event
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 586 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(482, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(585, 1) == '1') {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let busdTransfers = [];
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address == '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                busdTransfers.push(BigInt(receipt.logs[i].data));
            }
        }
        if (busdTransfers.length != 2) {
            console.error('Txn ' + result.transactionHash + ' has an unexpected number of BUSD transfers!');
        }
        row += '0,' + bigIntMax(busdTransfers).toString(10) + ',Bought USD+\n';
    }

    // This is a transaction where someone is buying USD+ using TETU through the TETU/USD+ LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // 1f681b1c4065057e07b95a1e5e504fb2c85f4625 is the TETU contract
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // 0 means this is a Cone volatile pool
    // 1705 / 100000 is the dollar price of TETU
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the Transfer(address indexed from, address indexed to, uint256 value) event
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 586 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == '1f681b1c4065057e07b95a1e5e504fb2c85f4625' &&
             txn.input.substr(482, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(585, 1) == '0') {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let tetuTransfers = [];
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address == '0x1f681B1c4065057E07b95a1E5e504fB2c85F4625' &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    tetuTransfers.push(BigInt(receipt.logs[i].data));
            }
        }
        if (tetuTransfers.length != 2) {
            console.error('Txn ' + result.transactionHash + ' has an unexpected number of TETU transfers!');
        }
        row += '0,' + (bigIntMax(tetuTransfers) * BigInt(1705) / BigInt(100000)).toString(10) + ',Bought USD+\n';
    }

    // This is a transaction where someone is buying USD+ using USDC through the USD+/BUSD LP.
    // 0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F is the Cone Router contract
    // 0xf41766d8 is the swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256) function selector
    // 8ac76a51cc950d9822d68b83fe1ad97b32cd580d is the USDC contract
    // e9e7cea3dedca5984780bafc599bd69add087d56 is the BUSD contract
    // e80772eaf6e2e18b651f160bc9158b2a5cafca65 is the USD+ contract
    // 1 means this is a Cone stable pool
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the Transfer(address indexed from, address indexed to, uint256 value) event
    else if (txn.to == '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F' &&
             txn.input.startsWith('0xf41766d8') &&
             txn.input.length == 778 &&
             txn.input.substr(226, 40) == txn.from.substr(2).toLowerCase() &&
             txn.input.substr(418, 40) == '8ac76a51cc950d9822d68b83fe1ad97b32cd580d' &&
             txn.input.substr(482, 40) == 'e9e7cea3dedca5984780bafc599bd69add087d56' &&
             txn.input.substr(674, 40) == 'e80772eaf6e2e18b651f160bc9158b2a5cafca65' &&
             txn.input.substr(585, 1) == '1' &&
             txn.input.substr(777, 1) == '1') {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let usdcTransfers = 0;
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address == '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                usdcTransfers++;
                if (usdcTransfers == 1) {
                    row += '0,' + BigInt(receipt.logs[i].data).toString(10) + ',Bought USD+\n';
                }
            }
        }
        if (usdcTransfers != 2) {
            console.error('Txn ' + result.transactionHash + ' has an unexpected number of USDC transfers!');
        }
    }

    // This is for REIGN protocol buy/sell transactions.
    // 0xdEC068b3a229c2b8EEa394FeAf7B48ee57F7222F is the REIGN protocol contract
    // 0x977bc1f72e41e9072b2e219f034ebe63c54fffe5 is the REIGN/USD+ LP contract
    else if (txn.to == '0xdEC068b3a229c2b8EEa394FeAf7B48ee57F7222F') {
        if (fromAddress == '0x977bc1f72e41e9072b2e219f034ebe63c54fffe5') {
            if (result.transactionHash != reignBuy && result.transactionHash != reignSell) {
                reignBuy = result.transactionHash;
                reignSell = '';
            } else {
                console.error('Txn ' + result.transactionHash + ' contains an unexpected REIGN protocol transfer from the LP!');
            }
            row += '0,' + amount + ',Bought USD+\n';
        } else if (toAddress == '0xdec068b3a229c2b8eea394feaf7b48ee57f7222f') {
            if (result.transactionHash != reignBuy && result.transactionHash != reignSell) {
                reignBuy = '';
                reignSell = result.transactionHash;
            } else {
                console.error('Txn ' + result.transactionHash + ' contains an unexpected REIGN protocol transfer to the protocol!');
            }
            row += '-' + amount + ',0,Sold USD+\n';
        } else if (toAddress == '0x977bc1f72e41e9072b2e219f034ebe63c54fffe5') {
            if (result.transactionHash == reignBuy) {
                row += '-' + amount + ',0,Sold USD+\n';
            } else if (result.transactionHash == reignSell) {
                row += '0,0,Internal LP transfer\n';
            } else {
                console.error('Txn ' + result.transactionHash + ' contains an unexpected REIGN protocol transfer to the LP!');
            }
        } else if (fromAddress == '0xdec068b3a229c2b8eea394feaf7b48ee57f7222f') {
            if (result.transactionHash == reignBuy) {
                row += '-' + amount + ',' + amount + ',Transferred USD+\n';
            } else if (result.transactionHash == reignSell) {
                row += '0,' + amount + ',Removed USD+ liquidity\n';
            } else {
                console.error('Txn ' + result.transactionHash + ' contains an unexpected REIGN protocol transfer from the protocol!');
            }
        } else {
            console.error('Txn ' + result.transactionHash + ' contains an unexpected transfer!');
        }
    }

    // This is for when a USD+ LP sends USD+ to another USD+ LP.
    else if (LP_ADDRESSES.includes(fromAddress) && LP_ADDRESSES.includes(toAddress)) {
        row += '0,0,Internal LP transfer\n';
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let usdPlusTransfers = [];
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address == '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65' &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                usdPlusTransfers.push([fixAddress(receipt.logs[i].topics[1]), fixAddress(receipt.logs[i].topics[2])]);
            }
        }
        if (usdPlusTransfers.length == 2 && LP_ADDRESSES.includes(usdPlusTransfers[1][0]) && !LP_ADDRESSES.includes(usdPlusTransfers[1][1])) {
            nextTransactionIsSellFee = true;
        }
    }

    // This is the USD+ fee that is removed directly from the LP following a USD+ sell transaction on Cone.
    else if (nextTransactionIsSellFee) {
        nextTransactionIsSellFee = false;
        row += '0,' + amount + ',Removed USD+ liquidity\n';
    }

    // Otherwise, we need to manually inspect the transaction and modify the CSV file accordingly.
    else {
        row += '0,0,Unknown txn requires manual inspection\n';
    }

    return row;
}

// Removes extra 12 bytes of 0 (24 '0' characters) at the beginning an address.
function fixAddress(address) {
    return '0x' + address.substr(26);
}

const bigIntMax = (args) => args.reduce((m, e) => e > m ? e : m);
