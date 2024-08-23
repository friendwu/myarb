import { ChainId } from '@uniswap/sdk-core';

export const config = {
    tokens: [
        {
            symbol: 'ETH',
            decimals: 18,
            addresses: {
                [ChainId.MAINNET]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                [ChainId.BNB]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            },
        },
        {
            symbol: 'BNB',
            decimals: 18,
            addresses: {
                [ChainId.MAINNET]: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
                [ChainId.BNB]: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            },
        },
        {
            symbol: 'BONK',
            decimals: 18,
            addresses: {
                [ChainId.MAINNET]: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
                [ChainId.BNB]: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            },
        },
    ],

    // 交易对的其中一方，例如 USDT
    usdTokens: [
        {
            symbol: 'USDT',
            decimals: 6,
            addresses: {
                [ChainId.MAINNET]: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                [ChainId.BNB]: '0x55d398326f99059ff775485246999027b3197955',
            },
        }
    ],

    tokenIn: 'ETH', // 交易对的另一方，例如 ETH
    amountIn: '1', // 以 tokenIn 计价的数量
    // 你可以在这里添加其他配置，如 token 地址等
};

