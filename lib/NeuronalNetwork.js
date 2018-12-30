"use strict";
const synaptic = require("brainjs");
//const synaptic = require("synaptic");
//const neataptic = require("neataptic");
const { Layer, Network, architect: Architect } = synaptic;

const LSTM_OPTIONS = {
    memoryToMemory: false,    
    outputToMemory: false,   
    outputToGates: false,
    inputToOutput: true,      
    inputToDeep: true
};

const TRAIN_OPTIONS = {
    log: 2,
    rate: 0.05,
    clear: true,
    iterations: 100,
    error: 0.1,
    dropout: 0.2,
    momentum: 0
};

class NeuronalNetwork {

    constructor(){
        this.nn = null;
        this.trainer = null;
    }

    create(...args){
        args.push(LSTM_OPTIONS);
        this.nn = new Architect.LSTM(...args);
    }

    train(dataset){
        dataset = this._datasetToTrainingSet(dataset);
        return this.nn.train(dataset, TRAIN_OPTIONS);
        //TODO NEAT ?
    }

    predict(data){
        return this.nn.activate(data);
    }

    //converts a coinstream fs file to a synaptic file x,y -> input,output
    _datasetToTrainingSet(dataset){
        return dataset.map(row => {
            return {
                input: row.x,
                output: row.y  
            };
        });
    }

    fromJSON(json){
        json = Buffer.isBuffer(json) ? json.toString("utf8") : json;
        json = typeof json !== "object" ? JSON.parse(json) : json;
        this.nn = Network.fromJSON(json);
    }

    toJSON(){
        return this.nn.toJSON();
    }

    toString(){
        return JSON.stringify(this.toJSON());
    }
}

module.exports = NeuronalNetwork;