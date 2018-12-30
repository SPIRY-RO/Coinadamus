"use strict";

const nanoStream = new Stream(null, 3333);
//const ethereumStream = new Stream(null, 3334);
//const litecoinStream = new Stream(null, 3335);

nanoStream.connect();

/*
setTimeout(() => {
    ethereumStream.connect();
    setTimeout(() => {
        litecoinStream.connect();
        }, 2000);
}, 2000);
*/

window.onresize = () => {
    nanoStream.resizePlots();
    //ethereumStream.resizePlots();
    //litecoinStream.resizePlots();
};