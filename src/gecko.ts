import { CoinGeckoClient } from 'coingecko-api-v3';
const client = new CoinGeckoClient({
    timeout: 10000,
    autoRetry: true,
});

//create a function to get the exchange tickers of binance.
const getExchangeTickersFromGecko = async (exchange: string) => {
    const exchangeTickers = {};
    //get all pages of exchange tickers
    let page = 1;
    while (true) {
        const tickers = await client.exchangeIdTickers({ id: exchange, page: page });
        if (tickers.tickers.length === 0) {
            break;
        }
        //merge tickers into exchangeTickers with key is coin_id
        tickers.tickers.forEach(element => {
            if (element.target === 'USDT' && !(element.coin_id in exchangeTickers)) {
                exchangeTickers[element.coin_id] = element;
            }
        });
        console.log(`page ${page} done`);
        page++;
    }

    console.log(`get pages all done`);


    const coinList = await client.coinList({ include_platform: true });

    const coinDict = {};
    coinList.forEach(element => {
        coinDict[element.id] = element;
    });

    const exchangeTickersWithPlatform = [];
    for (const [key, value] of Object.entries(exchangeTickers)) {
        try {
            const coin = coinDict[key];
            value['platforms'] = coin.platforms;
            exchangeTickersWithPlatform.push(value);
        } catch (err) {
            console.log(err);
        }
    }

    //console.log(exchangeTickersWithPlatform);
    //save exchangeTickersWithPlatform to file
    const fs = require('fs');
    const data = JSON.stringify(exchangeTickersWithPlatform);
    fs.writeFileSync(`${exchange}_TickersWithPlatform.json`, data);

    return exchangeTickersWithPlatform;
};

function loadExchangeTickersWithPlatformFromFile(exchange: string) {
    const fs = require('fs');
    const data = fs.readFileSync(`${exchange}_TickersWithPlatform.json`, 'utf8');
    const exchangeTickersWithPlatform = JSON.parse(data);

    // //filter out tickers with platform contains binance-smart-chain address.
    // const xx = exchangeTickersWithPlatform.filter(element => {
    //     return element.platforms['binance-smart-chain'] !== undefined;
    // }

    return exchangeTickersWithPlatform;
}

async function getExchangeTickers(exchange: string): Promise<any> {
    let res: any = null;
    try {
        res = await loadExchangeTickersWithPlatformFromFile(exchange);
    } catch (err) {
        res = await getExchangeTickersFromGecko(exchange);
    }

    return res;
}

export { getExchangeTickers };

//if main module, run this script
if (require.main === module) {
    (async () => {
        const x = await getExchangeTickers('binance');
        console.log(x);
    })();
}