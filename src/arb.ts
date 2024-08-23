import { ethers } from 'ethers';
import { AlphaRouter, DAI_BNB, SwapOptionsSwapRouter02, SwapType, USDT_ON } from '@uniswap/smart-order-router';
import * as ccxt from 'ccxt';
import * as dotenv from 'dotenv';
import { config } from './config';
import { ChainId, Percent, CurrencyAmount, TradeType, Token } from '@uniswap/sdk-core';
import * as qs from 'qs';
import sendMessageToChannel from './utils';
import { getExchangeTickers } from './gecko';

const chainIdMap = {
    [ChainId.MAINNET]: 'ethereum',
    [ChainId.BNB]: 'binance-smart-chain',
    [ChainId.POLYGON]: 'polygon-pos',
};
const unit = 100;
const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_PROVIDER);

dotenv.config();

const getTokenPriceFromCex = async (exchange: any, tokenSymbol: string, buyOrSell: string): Promise<number> => {
    try {
        const symbol = `${tokenSymbol}/USDT`;
        const orderBooks = await exchange.fetchOrderBook(symbol);

        if (buyOrSell === 'buy') {
            let amount = 0;
            let cost = 0;
            for (let i = 0; i < orderBooks.asks.length; i++) {
                const price = parseFloat(orderBooks.asks[i][0]);
                const amount1 = parseFloat(orderBooks.asks[i][1]);
                if (cost + price * amount1 <= unit) {
                    cost += price * amount1;
                    amount += amount1;
                } else {
                    amount += (unit - cost) / price;
                    cost = unit;
                    break;
                }
            }
            if (cost < unit) {
                console.error(`Not enough ${tokenSymbol} to buy on ${exchange.id}`);
                return NaN;
            }

            return unit / amount;
        } else { //sell token, so we look at the buy orders.
            let amount = 0;
            let cost = 0;
            for (let i = 0; i < orderBooks.bids.length; i++) {
                const price = parseFloat(orderBooks.bids[i][0]);
                const amount1 = parseFloat(orderBooks.bids[i][1]);
                if (cost + price * amount1 <= unit) {
                    cost += price * amount1;
                    amount += amount1;
                } else {
                    amount += (unit - cost) / price;
                    cost = unit;
                    break;
                }
            }
            if (cost < unit) {
                console.error(`Not enough ${tokenSymbol} to buy on ${exchange.id}`);
                return NaN;
            }

            return unit / amount;
        }


        //const ticker = await exchange.fetchTicker(symbol);
        //FIXME: use bid price instead of last price. should query orderbook.
        //return ticker.last;
    } catch (error) {
        console.error(error);
        //sleep 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        return NaN;
        //throw new Error(`Error fetching price from Binance for ${tokenSymbol}`);
    }
};


const getTokenPriceFromUniswap = async (tokenSymbol: string, chainId: ChainId): Promise<number> => {
    const router = new AlphaRouter({
        chainId: chainId,
        provider,
    });

    const tk = config.tokens.find(token => token.symbol === tokenSymbol);
    if (!tk) {
        throw new Error(`Token ${tokenSymbol} not found in config`);
    }

    const tokenAddress = tk.addresses[chainId];
    const tokenDecimals = tk.decimals;
    const tokenOut = new Token(chainId, tokenAddress, tokenDecimals, tokenSymbol);
    const options: SwapOptionsSwapRouter02 = {
        recipient: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        slippageTolerance: new Percent(5, 1000),
        deadline: Math.floor(Date.now() / 1000 + 1800),
        type: SwapType.SWAP_ROUTER_02,
    };

    const usdt = USDT_ON(chainId);
    const amountIn = CurrencyAmount.fromRawAmount(usdt, unit * 10 ** usdt.decimals);
    const route = await router.route(amountIn, tokenOut, TradeType.EXACT_INPUT, options);

    if (route) {
        console.log(tokenSymbol,
            "price: ", unit / parseFloat(route.quote.toExact()),
            "price with gas adjusted: ", unit / parseFloat(route.quoteGasAdjusted.toExact()),
            "gas used: ", route.estimatedGasUsedUSD.toExact());
        return unit / parseFloat(route.quoteGasAdjusted.toExact());
    }

    throw new Error('No route found');
};


const getTokenPriceFrom0xAPI = async (ticker: any, api_key: string, chainId: ChainId, buyOrSell: string): Promise<number> => {
    //TODO: may use different base token.
    const usdt = USDT_ON(chainId);
    let params: any;

    if (ticker.platforms[chainIdMap[chainId]] === undefined) {
        console.error(ticker.base, `platform ${chainIdMap[chainId]} not found`);
        return NaN;
    }

    if (buyOrSell === 'buy') {
        params = {
            buyToken: ticker.platforms[chainIdMap[chainId]],
            sellToken: usdt.address,
            sellAmount: `${unit * 10 ** usdt.decimals}`, // Note that the USDT token uses 18 decimal places, so `sellAmount` is `100 * 10^18`.
            takerAddress: '0x12e2A84dA0249d2623cc563D94d7A57F3028cFbE', //Address that will make the trade
            slippagePercentage: 0.005,
        };
    } else {
        params = {
            buyToken: usdt.address,
            sellToken: ticker.platforms[chainIdMap[chainId]],
            buyAmount: `${unit * 10 ** usdt.decimals}`, // Note that the USDT token uses 18 decimal places, so `sellAmount` is `100 * 10^18`.
            takerAddress: '0x12e2A84dA0249d2623cc563D94d7A57F3028cFbE', //Address that will make the trade
            slippagePercentage: 0.005,
        };
    }

    const headers = { '0x-api-key': api_key };
    const url = `https://api.0x.org/swap/v1/price?chainId=56&${qs.stringify(params)}`;
    const response = await fetch(
        url, { headers }
    );

    const responseJson = await response.json();
    //console.log(ticker.base, ' price on 0x: ', url, `${response.status}`);
    if (response.status != 200) {
        console.error(ticker.base, response.status, responseJson);
        if (response.status == 429) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return NaN;
    }

    return 1 / parseFloat(responseJson.price);
}

const get0xAPIKeys = async () => {
    const yaml = require('js-yaml');
    const fs = require('fs');
    const f = yaml.load(fs.readFileSync('./0x-api-keys.yaml', 'utf8'));

    let keys = [];
    f.forEach(async (element: any) => {
        keys = keys.concat(element.keys);
    });

    return keys;
}


const comparePrices = async (apiKeys: Array<string>, cex: string, chainId: ChainId, buySide: string) => {
    let tickers = await getExchangeTickers(cex);
    tickers = tickers.filter(element => {
        return chainIdMap[chainId] in element.platforms && !element.base.includes('USD');
    });

    const exchange = new ccxt[cex]({
        'apiKey': process.env[`${cex.toUpperCase()}_API_KEY`],
        'secret': process.env[`${cex.toUpperCase()}_API_SECRET`],
        'uid': 'test'
        //'proxy': f'http://{login}:{password}@{ip}:3000'
    });

    for (let myI = 0; myI < tickers.length; myI += apiKeys.length) {
        let p0 = [];
        apiKeys.forEach(async (key: any, keyI) => {
            if (myI + keyI < tickers.length) {
                let xPricePromise: Promise<number>;
                if (buySide == 'DEX') {
                    xPricePromise = getTokenPriceFrom0xAPI(tickers[myI + keyI], key, chainId, 'buy');
                } else {
                    xPricePromise = getTokenPriceFrom0xAPI(tickers[myI + keyI], key, chainId, 'sell');
                }
                p0.push(xPricePromise);
            }
        });

        let p1 = [];


        apiKeys.forEach(async (_: any, keyI) => {
            if (myI + keyI < tickers.length) {
                if (buySide == 'DEX') {
                    const cexPricePromise = getTokenPriceFromCex(exchange, tickers[myI + keyI].base, 'sell');
                    p1.push(cexPricePromise);
                } else {
                    const cexPricePromise = getTokenPriceFromCex(exchange, tickers[myI + keyI].base, 'buy');
                    p1.push(cexPricePromise);
                }
            }
        });

        const prices = await Promise.all([...p0, ...p1]);
        const dexPrice = prices.slice(0, prices.length / 2);
        const cexPrice = prices.slice(prices.length / 2);
        const buyPrice = buySide == 'DEX' ? dexPrice : cexPrice;
        const sellPrice = buySide == 'DEX' ? cexPrice : dexPrice;
        const buyAt = buySide == 'DEX' ? `0x/${ChainId[chainId]}` : cex;
        const sellAt = buySide == 'DEX' ? cex : `0x/${ChainId[chainId]}`;

        for (let j = 0; j < dexPrice.length; j++) {
            if (isNaN(dexPrice[j]) || isNaN(cexPrice[j])) {
                continue;
            }
            const profit = sellPrice[j] / buyPrice[j] * unit - unit;
            const msg = `${tickers[myI + j].base} ${buyAt} Buy Price: ${buyPrice[j].toPrecision(4)}, ${sellAt} Sell Price: ${sellPrice[j].toPrecision(4)}, profit: ${profit.toFixed(3)}USDT`;

            console.log(msg);

            if (profit >= 5) {
                const depositAddress = await exchange.fetchDepositAddress(tickers[myI + j].base);
                //console.log(tickers[myI + j], depositAddress);
                if (depositAddress && depositAddress.info.data.chain == chainIdMap[chainId]) {
                    sendMessageToChannel(msg);
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    };
}

async function main() {
    while (true) {
        try {
            const exchange = 'bitmart';
            let apiKeys = await get0xAPIKeys();

            await Promise.all([
                comparePrices(apiKeys.slice(2, 3), exchange, ChainId.BNB, 'CEX')]);
                //comparePrices(apiKeys.slice(3, 4), exchange, ChainId.BNB, 'DEX')]);
        } catch (error) {
            console.error(error);
        }
    }
}

main();

