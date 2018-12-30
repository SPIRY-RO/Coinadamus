"use strict";

const nanoStream = new Stream(null, 3333, true);
//const ethereumStream = new Stream(null, 3334, true);
//const litecoinStream = new Stream(null, 3335, true);

nanoStream.connect();
//ethereumStream.connect();
//litecoinStream.connect();

window.onresize = () => {
    nanoStream.resizePlots();
    //ethereumStream.resizePlots();
    //litecoinStream.resizePlots();
};