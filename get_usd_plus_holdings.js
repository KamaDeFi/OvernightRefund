import fs from 'fs';
import Web3 from 'web3';

const web3 = new Web3('https://bsc-dataseed.binance.org/');

const BLOCK_NUMBER = 22742225;
const USD_PLUS_CONTRACT = '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65';

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

const holders = {};

// 0x00366088 is the ownerLength() function selector
const holdersSize = await web3.eth.call({
    to: USD_PLUS_CONTRACT,
    data: '0x00366088',
}, BLOCK_NUMBER);

// 0x24359879 is the ownerAt(uint256) function selector
// 0xce6df7be is the ownerBalanceAt(uint256) function selector
for (let i = 0; i < holdersSize; i++) {
    let iHex = i.toString(16);
    let iHexLength = iHex.length;
    for (let j = 0; j < 64 - iHexLength; j++) {
        iHex = '0' + iHex;
    }

    const ownerAtData = '0x24359879' + iHex;
    let holder = await web3.eth.call({
        to: USD_PLUS_CONTRACT,
        data: ownerAtData
    }, BLOCK_NUMBER);
    holder = fixAddress(holder);

    if (LP_ADDRESSES.includes(holder)) {
        continue;
    }

    const ownerBalanceAtData = '0xce6df7be' + iHex;
    const balance = await web3.eth.call({
        to: USD_PLUS_CONTRACT,
        data: ownerBalanceAtData
    }, BLOCK_NUMBER);

    holders[holder] = (BigInt(balance) * BigInt(1000000000000)).toString(10);
}

let content = 'Address,Amount\n';
for (const [key, value] of Object.entries(holders)) {
    content += key + ',' + value + '\n';
}
fs.writeFile('usd_plus_holders_block_' + BLOCK_NUMBER + '.csv', content, err => {
    if (err) {
        console.error(err);
    }
});

// Removes extra 12 bytes of 0 (24 '0' characters) at the beginning an address.
function fixAddress(address) {
    return '0x' + address.substr(26);
}
