"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");
const fs = require("fs");
const _ = require('lodash')
const path = require("path");
//const {CURRENCY} = require("node-bitstamp");
const debug = require("debug")("coinpusher:coinstream");
const binance = require('node-binance-api')

const APIKEY = ''
const APISECRET = ''

const DELIMITER = "||";
const MAX_DATASET_SIZE = 1e5;

// API initialization //
binance.options({ 'APIKEY': APIKEY, 'APISECRET': APISECRET, 'reconnect': true });

class Coinstream extends EventEmitter {

    constructor(opts = {}){
        super();

        const {
            currency,
            step,
            streamDir,
            //tickerStream
        } = opts;

        this.currency = currency
        this.step = step || 20;
        this.streamDir = streamDir || path.join(__dirname, "./../streams");
        //this.tickerStream = tickerStream;

        this.collected = [];
        this.dataset = null; //TODO dont hold the full dataset in memory
        this.stream = null;
        this.lastTrade = null;
        this._intv = null;

        this.ask_s_tot = 0
        this.ask_m_tot = 0
        this.ask_l_tot = 0
        this.bid_s_tot = 0
        this.bid_m_tot = 0
        this.bid_l_tot = 0

        this.btc_min_p = 0
    }

    getStats(){
        return {
            currency: this.currency,
            filePath: this.getStreamFile(),
            count: this.collected.length,
            collected: this.collected,
            datasetSize: this.dataset.length,
            lastTrade: this.lastTrade,
            latestTrades: this.getLatestTrades(3)
        };
    }

    getLatestTrades(count = 10){

        if(!this.dataset || !this.dataset.length){
            return [];
        }

        let trades = [];

        if(this.dataset.length <= count){
            trades = this.dataset.slice(0);
        } else {
            for(let i = this.dataset.length - 1; i > (this.dataset.length - 1 - count); i--){
                trades.push(this.dataset[i]);
            }
            trades.reverse();
        }

        return trades;
    }

    getStreamFile(){
        return path.join(this.streamDir, `${this.currency}.fs`);
    }

    /**
     * reads the dataset file from disk
     * since we run append only on files, we use a proprietary format
     * where we simply JSON serialise each trade and separate them with ||
     * when appending to the file, therefore we have to read the file,
     * split for || and json parse single handedly as we append to an array
     * to get a list of trades back into memory
     * @param {*} full
     */
    loadStreamFromDisk(full = true){

        //create if not exists (sync)
        if(!fs.existsSync(this.getStreamFile())){
            fs.writeFileSync(this.getStreamFile(), "", "utf8");
            debug("fresh stream created", this.currency);
            return Promise.resolve([]);
        }

        return new Promise((resolve, reject) => {
            fs.readFile(this.getStreamFile(), (error, data) => {

                if(error){
                    return reject(error);
                }

                data = Buffer.isBuffer(data) ? data.toString("utf8") : data;
                const size = Buffer.byteLength(data, "utf8") / 1000;

                const dataset = [];
                let i = 0;
                const split = data.split(DELIMITER);

                if(!split || !split.length || split.length === 1){
                    debug("stream file is empty", this.currency);
                    return resolve([]);
                }

                split.forEach(part => {

                    i++;

                    if(part === "" || part === " "){
                        return; //skip spaces
                    }

                    if(!full && dataset.length >= MAX_DATASET_SIZE){
                        dataset.shift();
                    }

                    try {
                        const dpart = JSON.parse(part);
                        if(typeof dpart === "object" && dpart){
                            dataset.push(dpart);
                        } else {
                            debug("bad part in stream file", i, part);
                        }
                    } catch(error){
                        debug("failed to parse part in stream file", i, part, error);
                    }
                })

                debug("stream loaded", this.currency, size, "kb", dataset.length);
                resolve(dataset);
            });
        });
    }

    /**
     * subscribes to pusher stream
     * writes collected events to file (append mode) in an interval
     */
    startStream(){

        debug("starting coinstream", this.currency);

        binance.websockets.depthCache(['NANOBTC'], (symbol, depth) => {
            let bids = binance.sortBids(depth.bids);
            let asks = binance.sortAsks(depth.asks);
            this.ask_s_tot = _.sum(_.values(asks).slice(0,_.findLastIndex(_.keys(asks), o => { return parseFloat(o) <= parseFloat(binance.first(asks))+parseFloat(binance.first(asks))*0.001 })))
            this.ask_m_tot = _.sum(_.values(asks).slice(0,_.findLastIndex(_.keys(asks), o => { return parseFloat(o) <= parseFloat(binance.first(asks))+parseFloat(binance.first(asks))*0.01 })))
            this.ask_l_tot = _.sum(_.values(asks).slice(0,_.findLastIndex(_.keys(asks), o => { return parseFloat(o) <= parseFloat(binance.first(asks))+parseFloat(binance.first(asks))*0.1 })))
            this.bid_s_tot = _.sum(_.values(bids).slice(0,_.findLastIndex(_.keys(bids), o => { return parseFloat(o) >= parseFloat(binance.first(bids))-parseFloat(binance.first(bids))*0.001 })))
            this.bid_m_tot = _.sum(_.values(bids).slice(0,_.findLastIndex(_.keys(bids), o => { return parseFloat(o) >= parseFloat(binance.first(bids))-parseFloat(binance.first(bids))*0.01 })))
            this.bid_l_tot = _.sum(_.values(bids).slice(0,_.findLastIndex(_.keys(bids), o => { return parseFloat(o) >= parseFloat(binance.first(bids))-parseFloat(binance.first(bids))*0.1 })))
            this.depth_diff = 100 * (binance.first(asks) - binance.first(bids)) / (binance.first(bids))
            //console.log(this.depth_diff+" :: "+this.bid_s_tot+"/"+this.ask_s_tot+" "+this.bid_m_tot+"/"+this.ask_m_tot+" "+this.bid_l_tot+"/"+this.ask_l_tot)
        });

        binance.websockets.candlesticks(['BTCUSDT'], "1m", (candlesticks) => {
            let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlesticks;
            let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks;
            if (isFinal) this.btc_min_p = (close-open)/open
          });

        binance.websockets.trades(['NANOBTC'], (trades) => {
            let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:timestamp} = trades;
            if (this.ask_l_tot > 0) {
                debug("trade ----> ", this.currency + " " + symbol+" "+price+" "+quantity+" "+maker+" "
                    +this.depth_diff+" :: "+this.bid_s_tot+"/"+this.ask_s_tot+" "+this.bid_m_tot+"/"+this.ask_m_tot+" "+this.bid_l_tot+"/"+this.ask_l_tot+" "+this.btc_min_p);
                var trade = {
                    "timestamp": timestamp/1000,
                    "price": parseFloat(price),
                    "quantity": parseFloat(quantity),
                    "maker": maker,
                    "depth_diff": this.depth_diff,
                    "bid_s_tot": this.bid_s_tot,
                    "ask_s_tot": this.ask_s_tot,
                    "bid_m_tot": this.bid_m_tot,
                    "ask_m_tot": this.ask_m_tot,
                    "bid_l_tot": this.bid_l_tot,
                    "ask_l_tot": this.ask_l_tot,
                    "btc_min_p": this.btc_min_p
                }
                //push to collected so that it is stored to disk later
                this.collected.push(trade);

                //push to dataset so that fresh data is available in memory
                if(this.dataset.length >= MAX_DATASET_SIZE){
                    this.dataset.shift();
                }

                this.dataset.push(trade);

                this.lastTrade = new Date().toISOString();
                super.emit("trade", {
                    currency: this.currency,
                    trade
                });
            }
        });

        //const topic = this.tickerStream.subscribe(this.currency);

        //it actually very easy to adapt this to any other kind of datasource
        //the only important thing is that it emits events with an object
        //that at least contains {price, timestamp} where price is a float
        //and timestamp is a unix seconds timestamp
        /*
        this.tickerStream.on(topic, trade => {

            const {type, cost} = trade;

            //push to collected so that it is stored to disk later
            this.collected.push(trade);

            //push to dataset so that fresh data is available in memory

            if(this.dataset.length >= MAX_DATASET_SIZE){
                this.dataset.shift();
            }

            this.dataset.push(trade);

            this.lastTrade = new Date().toISOString();
            debug("trade ----> ", this.currency, cost, type);
            super.emit("trade", {
                currency: this.currency,
                trade
            });
        });
        */

        this._intv = setInterval(() => {

            if(this.collected.length < this.step){
                return;
            }

            debug("storing latest collection of stream", this.currency, this.collected.length);
            const transfer = this.collected.slice(0);
            this.collected = []; //reset

            let appendData = "";
            transfer.forEach(trade => {
                appendData += JSON.stringify(trade) + DELIMITER;
            });

            fs.appendFile(this.getStreamFile(), appendData, error => {

                if(error){
                    return console.error(error);
                }

                debug("successfully appended stream", this.currency);
            });
        }, 3000);
    }

    async start(){
        this.dataset = await this.loadStreamFromDisk(false);
        this.startStream();
        return true;
    }

    close(){

        debug("closing", this.currency);
        if(this._intv){
            clearInterval(this._intv);
        }
    }
}

module.exports = Coinstream;
