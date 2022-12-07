import fetch from 'node-fetch';
import fs from 'fs';
import * as dotenv from 'dotenv';
import Web3 from 'web3';

dotenv.config();

const web3 = new Web3('https://bsc-dataseed.binance.org/');

const BLOCK_NUMBER = 22742224;

const LP_ADDRESSES = [
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816',  // s-USD+/BUSD
    '0xec30da6361905b8f3e4a93513d937db992301276',  // v-WBNB/USD+
    '0x0f8c95890b7bdecfae7990bf32f22120111e0b44',  // v-TETU/USD+
    '0x30f96ad4856d7e699963b589591f03710976a6e8',  // s-MDB+/USD+
    '0xcaa926480d998522beb3ded06d4ee367fba4eaad',  // v-USDFI/USD+
    '0xdee33737634bb7612c15b10488819e88fd62f0f9',  // v-TIGAR/USD+
    '0xd24c3ae86bd009d1de3550e378897a7f126647d1',  // v-STABLE/USD+
    '0xb0b693879e41cb28aed63b134bef16f5543e9598',  // v-MDB+/USD+
    '0x41a77bd568008dc6fe745db6f5bedb7663d5ee08',  // v-UNKWN/USD+
    '0x82ef7b01bc81117c86c82f4597ab032e39c46c61',  // v-ELONTWEET/USD+
    '0x977bc1f72e41e9072b2e219f034ebe63c54fffe5',  // CAKE-REIGN/USD+
];

// Addresses that receive the LP tokens in Tetu vault staking/unstaking to ignore.
const TETU_VAULT_ADDRESS = {
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816': '0xc58d1d090e996f3a907ebd73f25249b25f81d401',
    '0xec30da6361905b8f3e4a93513d937db992301276': '0xce0575de6953a1a8c740b221d62086fb289236cc',
    '0x0f8c95890b7bdecfae7990bf32f22120111e0b44': '0x750ba01724f1d7b08d021bb05e7d543b2ec01d05',
    '0x30f96ad4856d7e699963b589591f03710976a6e8': '0x3651465aa43afc9bd45613cf3cd8d4439e60123c',
}

// Addresses that receive the LP tokens in Tetu vault staking/unstaking to ignore.
const TETU_PROXY_ADDRESS = {
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816': '0x811eb43826cb1c8f83400449f967ddc507360728',
    '0xec30da6361905b8f3e4a93513d937db992301276': '0xc73670e9a38aba2d5b41fb7518661ba8be080264',
    '0x0f8c95890b7bdecfae7990bf32f22120111e0b44': '0xde37a9c8ae1f756d4faec78c22a9fd5452046281',
    '0x30f96ad4856d7e699963b589591f03710976a6e8': '0x019ba377234d9ee55ab512410a1cd8d33a599c1d',
}

// The Beefy receipt tokens when staking on that platform.
const BEEFY_TOKEN_ADDRESS = {
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816': '0x508aef0252d63440da1604663a5f6e7e2153cf86',
    '0xec30da6361905b8f3e4a93513d937db992301276': '0x395aead3335db28bbdd8804ee485e0abe87462b2',
}

// The Beefy strategy addresses.
const BEEFY_STRATEGY_ADDRESS = {
    '0x0fe6cf7a2687c5bddf302c5ccea901ba0bf71816': '0x300c1617d77b0736a4e50ce49ef747024518839d',
    '0xec30da6361905b8f3e4a93513d937db992301276': '0x59e2b49468762514a71f763a0d2d0cad397040f6',
}

// A dictionary from LP->Holder->Amount.
const holders = {};

// Used to ignore transactions that have been already processed.
const transactions_already_processed = [];

// Used to ignore LP token tranfers when staking in Unknown.
// let stakeTransaction = '';
// let unknownStaker = '';
let unknownStakeTransfers = 0;

// Used to ignore LP token transfers when unstaking from Unknown.
// let unstakeTransaction = '';
// let unknownUnstaker = '';
let unknownUnstakeTransfers = 0;

// Used to ignore LP token tranfers when staking in a Tetu vault.
// let tetuStakeTransaction = '';
let tetuStakeTransfers = 0;

// Used to ignore LP token tranfers when unstaking from a Tetu vault.
// let tetuUnstakeTransaction = '';
let tetuUnstakeTransfers = 0;

processAllTransactions();

// Processes all the transactions involving LP tokens being transferred by querying the "transfer" events between two blocks.
// 19657538 is the block number where the Cone factory contract was created. It is before the creation of all the above LP tokens.
// Prints the LP holdings at the final block in a CSV file.
// Also prints how much users hold in USD+ in those LPs at the final block in a separate CSV file.
async function processAllTransactions() {
    const actualTotalSupply = {};

    for (let i = 0; i < LP_ADDRESSES.length; i++) {

        // 0x18160ddd is the totalSupply() function selector.
        const totalSupply = await web3.eth.call({
            to: LP_ADDRESSES[i],
            data: '0x18160ddd',
        }, BLOCK_NUMBER);
        actualTotalSupply[LP_ADDRESSES[i]] = BigInt(totalSupply);

        // Split requests because BscScan can only return 1000 results per API call.
        for (let end = 19657538 + 30846;; end += 30846) {
            end++;
            let start = end - 30846;
            if (end > BLOCK_NUMBER) {
                end = BLOCK_NUMBER;
            }
            console.log('Start: ' + start + ' End: ' + end);
            const response = await fetch('https://api.bscscan.com/api?module=logs&action=getLogs&fromBlock=' + start + '&toBlock=' + end + '&address=' + LP_ADDRESSES[i] + '&topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef&apikey=' + process.env.BSC_SCAN_API_KEY, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });
            await getHolders(await response.json(), LP_ADDRESSES[i]);
            await sleep(201);
            if (end == BLOCK_NUMBER) {
                break;
            }
        }
    }

    const countedTotalSupply = {};

    let content = 'LP Address,Holder,Amount\n';
    for (const [lp_address, lp_holders] of Object.entries(holders)) {
        countedTotalSupply[lp_address] = BigInt(0);
        for (const [user_address, lp_amount] of Object.entries(lp_holders)) {
            if (lp_amount > 0) {
                content += lp_address + ',' + user_address + ',' + lp_amount + '\n';
                countedTotalSupply[lp_address] += lp_amount;
            }
        }
        // Check that the counted total supply is close enough to the actual total supply.
        console.log('Actual total supply of ' + lp_address + ': ' + actualTotalSupply[lp_address]);
        console.log('Counted total supply of ' + lp_address + ': ' + countedTotalSupply[lp_address]);
    }

    fs.writeFile('all_usd_plus_lp_holdings_' + BLOCK_NUMBER + '.csv', content, err => {
        if (err) {
            console.error(err);
        }
    });

    const usdPlusInLPs = {};
    for (const [lp_address, lp_holders] of Object.entries(holders)) {
        // 0x70a08231 is the balanceOf() function selector.
        let addressInData = '0x70a08231000000000000000000000000' + lp_address.substr(2);

        // 0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65 is the USD+ contract.
        let balance = await web3.eth.call({
            to: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
            data: addressInData
        }, BLOCK_NUMBER);

        for (const [user_address, lp_amount] of Object.entries(lp_holders)) {
            if (!(user_address in usdPlusInLPs)) {
                usdPlusInLPs[user_address] = BigInt(0);
            }
            if (lp_amount > 0) {
                usdPlusInLPs[user_address] += (lp_amount * BigInt(balance) * BigInt(1000000000000) / countedTotalSupply[lp_address]);
            }
        }
    }

    content = 'Holder,Amount\n';
    for (const [user, usd_plus_amount] of Object.entries(usdPlusInLPs)) {
        if (usd_plus_amount > 0) {
            content += user + ',' + usd_plus_amount + '\n';
        }
    }

    fs.writeFile('user_usd_plus_in_lps_' + BLOCK_NUMBER + '.csv', content, err => {
        if (err) {
            console.error(err);
        }
    });
}

// Gets all the holders of LP tokens at the specified block (including staked tokens).
async function getHolders(response, lp) {
    if (response.result.length == 0) {
        return;
    }
    if (response.result.length == 1000) {
        console.error('1000 responses in logs request');
        return;
    }

    // 0xd660eb81 is the unkwnPoolByConePool(address) function selector.
    const unknownPool = await web3.eth.call({
        to: '0x5b1ceb9adcec674552cb26dd55a5e5846712394c',
        data: '0xd660eb81000000000000000000000000' + lp.substr(2),
    });

    // 0x0912d039 is the gaugeByConePool(address) function selector.
    const gaugePool = await web3.eth.call({
        to: '0x5b1ceb9adcec674552cb26dd55a5e5846712394c',
        data: '0x0912d039000000000000000000000000' + lp.substr(2),
    });

    for (let i = 0; i < response.result.length; i++) {
        await processTransaction(response.result[i], fixAddress(unknownPool), fixAddress(gaugePool), lp);
    }
}

// Processes a single transaction involving an LP token being transferred, and updates the holders dict.
async function processTransaction(result, unknownPool, gaugePool, lp) {
    if (transactions_already_processed.includes(result.transactionHash)) {
        return;
    }

    const fromAddress = fixAddress(result.topics[1]);
    const toAddress = fixAddress(result.topics[2]);
    const amount = BigInt(result.data);

    if (!(lp in holders)) {
        holders[lp] = {};
    }
    if (!(fromAddress in holders[lp])) {
        holders[lp][fromAddress] = BigInt(0);
    }
    if (!(toAddress in holders[lp])) {
        holders[lp][toAddress] = BigInt(0);
    }

    const txn = await web3.eth.getTransaction(result.transactionHash);
    const functionSelector = txn.input.substr(0, 10);

    // Ignoring a number of LP token transfer transactions that we know belong to a
    // stake transaction in Unknown.
    if (unknownStakeTransfers > 0) {
        // These are checks that were used to ensure that all Unknown stake transactions look the same.
        // They all passed so the checks are no longer needed. Keeping them in a comment for documentation.
        // 0xde974e16 is the userProxyByAccount(address) function selector
        // const userProxy = await web3.eth.call({
        //     to: '0x5b1ceb9adcec674552cb26dd55a5e5846712394c',
        //     data: '0xde974e16000000000000000000000000' + unknownStaker,
        // });
        // if (unknownStakeTransfers == 5) {
        //     if (fromAddress != '0xaed5a268dee37677584af58ccc2b9e3c83ab7dd8' || toAddress != fixAddress(userProxy)) {
        //         console.error('Unexpected Unknown stake transfer 5: https://bscscan.com/tx/' + stakeTransaction);
        //     }
        // } else if (unknownStakeTransfers == 4) {
        //     if (fromAddress != fixAddress(userProxy) || toAddress != unknownPool) {
        //         console.error('Unexpected Unknown stake transfer 4: https://bscscan.com/tx/' + stakeTransaction);
        //     }
        // } else if (unknownStakeTransfers == 3) {
        //     if (fromAddress != unknownPool || toAddress != '0xe6fd9db77facc2f73dad6041102a9f33855f423b') {
        //         console.error('Unexpected Unknown stake transfer 3: https://bscscan.com/tx/' + stakeTransaction);
        //     }
        // } else if (unknownStakeTransfers == 2) {
        //     if (fromAddress != '0xe6fd9db77facc2f73dad6041102a9f33855f423b' || toAddress != '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941') {
        //         console.error('Unexpected Unknown stake transfer 2: https://bscscan.com/tx/' + stakeTransaction);
        //     }
        // } else if (unknownStakeTransfers == 1) {
        //     if (fromAddress != '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941' || toAddress != gaugePool) {
        //         console.error('Unexpected Unknown stake transfer 1: https://bscscan.com/tx/' + stakeTransaction);
        //     }
        // }
        unknownStakeTransfers--;
    }

    // Ignoring a number of LP token transfer transactions that we know belong to an
    // unstake transaction from Unknown.
    else if (unknownUnstakeTransfers > 0) {
        // These are checks that were used to ensure that all Unknown unstake transactions look the same.
        // They all passed so the checks are no longer needed. Keeping them in a comment for documentation.
        // if (unknownUnstakeTransfers == 3) {
        //     if (fromAddress != '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941'|| toAddress != unknownPool) {
        //         console.error('Unexpected Unknown unstake transfer 3: https://bscscan.com/tx/' + unstakeTransaction);
        //     }
        // } else if (unknownUnstakeTransfers == 2) {
        //     if (fromAddress != unknownPool || toAddress != unknownUnstaker) {
        //         console.error('Unexpected Unknown unstake transfer 2: https://bscscan.com/tx/' + unstakeTransaction);
        //         console.error('Expected fromAddress: ' + unknownPool + ' toAddress: ' + unknownUnstaker);
        //     }
        // } else if (unknownUnstakeTransfers == 1) {
        //     if (fromAddress != unknownUnstaker) {
        //         console.error('Unexpected Unknown unstake transfer 1: https://bscscan.com/tx/' + unstakeTransaction);
        //         console.error('Expected fromAddress: ' + unknownUnstaker);
        //     }
        // }
        unknownUnstakeTransfers--;
    }

    // Ignoring a number of LP token transfer transactions that we know belong to a
    // stake transaction in Tetu.
    else if (tetuStakeTransfers > 0) {
        // These are checks that were used to ensure that all Tetu stake transactions look the same.
        // They all passed so the checks are no longer needed. Keeping them in a comment for documentation.
        // if (tetuStakeTransfers == 3) {
        //     if (fromAddress != TETU_VAULT_ADDRESS[lp] || toAddress != TETU_PROXY_ADDRESS[lp]) {
        //         console.error('Unexpected Tetu stake transfer 3: https://bscscan.com/tx/' + tetuStakeTransaction);
        //     }
        // } else if (tetuStakeTransfers == 2) {
        //     if (fromAddress != TETU_PROXY_ADDRESS[lp] || toAddress != '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947') {
        //         console.error('Unexpected Tetu stake transfer 2: https://bscscan.com/tx/' + tetuStakeTransaction);
        //     }
        // } else if (tetuStakeTransfers == 1) {
        //     if (fromAddress != '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947' || toAddress != gaugePool) {
        //         console.error('Unexpected Tetu stake transfer 1: https://bscscan.com/tx/' + tetuStakeTransaction);
        //     }
        // }
        tetuStakeTransfers--;
    }

    // Ignoring a number of LP token transfer transactions that we know belong to an
    // unstake transaction from Tetu.
    else if (tetuUnstakeTransfers > 0) {
        // These are checks that were used to ensure that all Tetu unstake transactions look the same.
        // They all passed so the checks are no longer needed. Keeping them in a comment for documentation.
        // if (tetuUnstakeTransfers == 3) {
        //     if (fromAddress != '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947'|| toAddress != TETU_PROXY_ADDRESS[lp]) {
        //         console.error('Unexpected Tetu unstake transfer 3: https://bscscan.com/tx/' + tetuUnstakeTransaction);
        //     }
        // } else if (tetuUnstakeTransfers == 2) {
        //     if (fromAddress != TETU_PROXY_ADDRESS[lp] || toAddress != TETU_VAULT_ADDRESS[lp]) {
        //         console.error('Unexpected Tetu unstake transfer 2: https://bscscan.com/tx/' + tetuUnstakeTransaction);
        //     }
        // } else if (tetuUnstakeTransfers == 1) {
        //     if (fromAddress != TETU_VAULT_ADDRESS[lp] || toAddress != txn.from.toLowerCase()) {
        //         console.error('Unexpected Tetu unstake transfer 1: https://bscscan.com/tx/' + tetuUnstakeTransaction);
        //     }
        // }
        tetuUnstakeTransfers--;
    }

    // The initial LP token transfer belonging to an Unknown stake transaction.
    // 0xaed5a268dee37677584af58ccc2b9e3c83ab7dd8 is the Unknown staking address.
    else if (toAddress == '0xaed5a268dee37677584af58ccc2b9e3c83ab7dd8') {
        // This is a check that was used to ensure that no Unknown stake transaction happened from the 0 address.
        // This check passed so it is no longer needed. Keeping it in a comment for documentation.
        // if (fromAddress == '0x0000000000000000000000000000000000000000') {
        //     console.error('Unexpected Unknown stake from null address: https://bscscan.com/tx/' + result.transactionHash);
        // }
        // unknownStaker = fromAddress.substr(2);
        // stakeTransaction = result.transactionHash;
        unknownStakeTransfers = 5;
    }

    // Unstaking from Tetu.
    // 0x2e1a7d4d is the withdraw(uint256) function selector.
    // 0xe9fad8ee is the exit() function selector.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    else if (txn.to.toLowerCase() == TETU_VAULT_ADDRESS[lp] &&
             (functionSelector == '0x2e1a7d4d' || functionSelector == '0xe9fad8ee')) {
        // When unstaking from the Tetu, the unstaked LP amount is larger than what was staked.
        // Attempt to update the user holdings of the LP. This will only work if the amount
        // being unstaked is larger than our previous record of the user's holdings.
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let amountStaked = BigInt(0);
        for (let i = receipt.logs.length - 1; i >= 0; i--) {
            if (receipt.logs[i].address.toLowerCase() == lp &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                fixAddress(receipt.logs[i].topics[1]) == TETU_VAULT_ADDRESS[lp]) {
                let user = fixAddress(receipt.logs[i].topics[2]);
                amountStaked = BigInt(receipt.logs[i].data);
                if (amountStaked > holders[lp][user]) {
                    holders[lp][user] = amountStaked;
                }
                break;
            }
        }
        transactions_already_processed.push(result.transactionHash);
    }

    // The initial LP token transfer belonging to a Tetu stake transaction.
    else if (toAddress == TETU_VAULT_ADDRESS[lp]) {
        // This is a check that was used to ensure that no Tetu stake transaction happened from the 0 address.
        // This check passed so it is no longer needed. Keeping it in a comment for documentation.
        // if (fromAddress == '0x0000000000000000000000000000000000000000') {
        //     console.error('Unexpected Tetu stake from null address: https://bscscan.com/tx/' + result.transactionHash);
        // }
        // tetuStakeTransaction = result.transactionHash;
        tetuStakeTransfers = 3;
    }

    // The initial LP token transfer belonging to an Unknown unstake transaction.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    // 0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941 is the first address that gets the LP tokens transferred to
    // upon unstaking from Unknown.
    else if (fromAddress == gaugePool && toAddress == '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941') {
        // Checks to ensure that all Unknown unstake transactions look the same.
        // The checks passed so they are no longer needed. Keeping them in a comment for documentation.
        // unstakeTransaction = result.transactionHash;
        // const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        // let count = 0;
        // for (let i = 0; i < receipt.logs.length; i++) {
        //     if (receipt.logs[i].address.toLowerCase() == lp && receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
        //         if (count == 0 && fixAddress(receipt.logs[i].topics[1]) == gaugePool && fixAddress(receipt.logs[i].topics[2]) == '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941') {
        //             count++;
        //         } else if (count == 1 && fixAddress(receipt.logs[i].topics[1]) == '0x8c17f8dd3f93b66d26736cd609e9d9b6113ae941' && fixAddress(receipt.logs[i].topics[2]) == unknownPool) {
        //             count++;
        //         } else if (count == 2 && fixAddress(receipt.logs[i].topics[1]) == unknownPool) {
        //             unknownUnstaker = fixAddress(receipt.logs[i].topics[2]);
        //             break;
        //         }
        //     }
        // }
        // if (count != 2) {
        //     console.error('Unexpected number of LP token transfers in Unknown unstaking: https://bscscan.com/tx/' + result.transactionHash);
        // }
        unknownUnstakeTransfers = 3;
    }

    // Another flavor of unstaking from Tetu.
    // The initial LP token transfer belonging to a Tetu unstake transaction.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    // 0xae1c06bb4c68391e6775eea195f1ae34c9d7f947 is the first address that gets the LP tokens transferred to
    // upon unstaking from Tetu.
    else if (fromAddress == gaugePool && toAddress == '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947') {
        tetuUnstakeTransfers = 3;
        // tetuUnstakeTransaction = result.transactionHash;
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let count = 0;
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address.toLowerCase() == lp && receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                if (count == 0 && fixAddress(receipt.logs[i].topics[1]) == gaugePool && fixAddress(receipt.logs[i].topics[2]) == '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947') {
                    count++;
                } else if (count == 1 && fixAddress(receipt.logs[i].topics[1]) == '0xae1c06bb4c68391e6775eea195f1ae34c9d7f947' && fixAddress(receipt.logs[i].topics[2]) == TETU_PROXY_ADDRESS[lp]) {
                    count++;
                } else if (count == 2 && fixAddress(receipt.logs[i].topics[1]) == TETU_PROXY_ADDRESS[lp] && fixAddress(receipt.logs[i].topics[2]) == TETU_VAULT_ADDRESS[lp]) {
                    count++;
                } else if (count == 3 && fixAddress(receipt.logs[i].topics[1]) == TETU_VAULT_ADDRESS[lp]) {
                    const userUnstaking = fixAddress(receipt.logs[i].topics[2]);
                    const amountUnstaking = BigInt(receipt.logs[i].data);
                    if (holders[lp][userUnstaking] < amountUnstaking) {
                        holders[lp][userUnstaking] = amountUnstaking;
                    }
                    break;
                }
            }
        }
        // A check to ensure that all Tetu unstake transactions look the same.
        // This check passed so it is no longer needed. Keeping it in a comment for documentation.
        // if (count != 3) {
        //     console.error('Unexpected number of LP token transfers in Tetu unstaking: https://bscscan.com/tx/' + result.transactionHash);
        // }
    }

    // Ignore TETU autocompounding transactions like:
    // https://bscscan.com/tx/0x38ab2a667e4e19d77eadee7ed62f810f2752b3c7659492de6a0248016da1f7a5
    // This is to simplify the code. The LP holdings of users staked in Tetu may not be 100% accurate.
    // There is code above that attempts to rectify this for some users who unstake from Tetu and the
    // amount they unstaked is larger than their known LP holding.
    else if (fromAddress == '0x0000000000000000000000000000000000000000' && toAddress == TETU_PROXY_ADDRESS[lp]) {
    }

    // Ignore Cone stake/unstake transactions like:
    // https://bscscan.com/tx/0x13b31472c2f3271521452371222605589d81671ec9431d963c77885618a95280
    // https://bscscan.com/tx/0xb986203f8d3d30d715a46dbf40dfc60414db6d8677bc8459a8ffff7795492c4e
    // https://bscscan.com/tx/0xae136368da1054e8c80b3b02b3ee4776a654396243689014ec4ce6975569dffe
    else if (fromAddress == gaugePool || toAddress == gaugePool) {
    }

    // Zapping to Beefy.
    // 0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86 is the Beefy Zap contract.
    // 0xf5d07b60 is the beefIn(address,uint256,address,uint256) function selector.
    // 0x70fae20d is the beefInETH(address,uint256) function selector.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    else if (txn.to.toLowerCase() == '0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86' &&
             (functionSelector == '0xf5d07b60' || functionSelector == '0x70fae20d')) {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let amountStaked = BigInt(0);
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address.toLowerCase() == lp &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                fixAddress(receipt.logs[i].topics[1]) == '0x0000000000000000000000000000000000000000' &&
                fixAddress(receipt.logs[i].topics[2]) == '0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86') {
                amountStaked = BigInt(receipt.logs[i].data);
            } else if (receipt.logs[i].address.toLowerCase() == BEEFY_TOKEN_ADDRESS[lp] &&
                       receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                       fixAddress(receipt.logs[i].topics[1]) == '0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86') {
                let user = fixAddress(receipt.logs[i].topics[2]);
                if (!(user in holders[lp])) {
                    holders[lp][user] = BigInt(0);
                }
                holders[lp][user] += amountStaked;
            }
        }
        transactions_already_processed.push(result.transactionHash);
    }

    // Unzapping from Beefy.
    // 0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86 is the Beefy Zap contract.
    // 0x51c9cf91 is the beefOutAndSwap(address,uint256,address,uint256) function selector.
    // 0xa28c361b is the beefOut(address,uint256) function selector.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    else if (txn.to.toLowerCase() == '0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86' &&
             (functionSelector == '0x51c9cf91' || functionSelector == '0xa28c361b')) {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        let user = ''
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address.toLowerCase() == BEEFY_TOKEN_ADDRESS[lp] &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                        fixAddress(receipt.logs[i].topics[2]) == '0xd0a01e04ec25e98bafc6ea22ec655b51c5b8ef86') {
                user = fixAddress(receipt.logs[i].topics[1]);
            } else if (receipt.logs[i].address.toLowerCase() == lp &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                holders[lp][user] -= BigInt(receipt.logs[i].data);
                if (holders[lp][user] < BigInt(0)) {
                    holders[lp][user] = BigInt(0);
                }
                break;
            }
        }
        transactions_already_processed.push(result.transactionHash);
    }

    // Some Beefy functions that don't involve user holdings changing.
    // 0x4641257d is the harvest() function selector.
    // 0x4700d305 is the panic() function selector.
    // 0x3f4ba83a is the unpause() function selector.
    // This ignores the fact that Beefy autocompounds. THis is to simplify the code.
    // The LP holdings of users staked in Beefy may not be 100% accurate.
    // There is code above that attempts to rectify this for some users who unstake from Beefy and the
    // amount they unstaked is larger than their known LP holding.
    else if (txn.to.toLowerCase() == BEEFY_STRATEGY_ADDRESS[lp] &&
             (functionSelector == '0x4641257d' || functionSelector == '0x4700d305' || functionSelector == '0x3f4ba83a')) {
        transactions_already_processed.push(result.transactionHash);
    }

    // Unstaking from Beefy.
    // 0x2e1a7d4d is the withdraw(uint256) function selector.
    // 0x853828b6 is the withdrawAll() function selector.
    // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef is the transfer event.
    else if (txn.to.toLowerCase() == BEEFY_TOKEN_ADDRESS[lp] &&
             (functionSelector == '0x2e1a7d4d' || functionSelector == '0x853828b6')) {
        const receipt = await web3.eth.getTransactionReceipt(result.transactionHash);
        for (let i = 0; i < receipt.logs.length; i++) {
            if (receipt.logs[i].address.toLowerCase() == lp &&
                receipt.logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                fixAddress(receipt.logs[i].topics[1]) == BEEFY_TOKEN_ADDRESS[lp]) {
                const user = fixAddress(receipt.logs[i].topics[2]);
                if (holders[lp][user] < BigInt(receipt.logs[i].data)) {
                    holders[lp][user] = BigInt(receipt.logs[i].data);
                }
            }
        }
        transactions_already_processed.push(result.transactionHash);
    }

    // Staking in Beefy.
    // 0xb6b55f25 is the deposit(uint256) function selector.
    // 0xde5f6268 is the depositAll() function selector.
    else if (txn.to.toLowerCase() == BEEFY_TOKEN_ADDRESS[lp] &&
             (functionSelector == '0xb6b55f25' || functionSelector == '0xde5f6268')) {
        transactions_already_processed.push(result.transactionHash);
    }

    else if (fromAddress == '0x0000000000000000000000000000000000000000' ) {
        if (toAddress != '0x0000000000000000000000000000000000000000') {
            holders[lp][toAddress] += amount;
        }
    }

    else if (toAddress == '0x0000000000000000000000000000000000000000') {
        if (fromAddress != '0x0000000000000000000000000000000000000000') {
            holders[lp][fromAddress] -= amount;
        }
    }

    else {
        holders[lp][fromAddress] -= amount;
        holders[lp][toAddress] += amount;
    }

    if (holders[lp][fromAddress] < 0) {
        holders[lp][fromAddress] = BigInt(0);
    }
    if (holders[lp][toAddress] < 0) {
        holders[lp][toAddress] = BigInt(0);
    }
}

// Removes extra 12 bytes of 0 (24 '0' characters) at the beginning an address.
function fixAddress(address) {
    return '0x' + address.substr(26);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
