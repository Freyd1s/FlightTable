const http = require('http');
const puppeteer = require('puppeteer'); // npm install puppeteer
const $ = require('cheerio');           // npm install cheerio --save
const st = require('node-static');

const file = new st.Server('.');

const server = new http.Server();

let arrivingFlights = [];
let derivingFlights = [];

server.listen(8080,'127.0.0.1');

// Обновляем данные о рейсах раз в 5 минут.
function refreshFlights () {
    getFlights('arrivals').then( resolve => {
        arrivingFlights = resolve;
    }, () => {
        arrivingFlights = [];
    });
    getFlights('departures').then( resolve => {
        derivingFlights = resolve;
        setTimeout(refreshFlights, 300000);
    }, () => {
        derivingFlights = [];
        setTimeout(refreshFlights, 300000);
    });
}
refreshFlights();

// Обработчк запросов к серверу:
server.on('request', function (req, res) {
    res.setHeader('Cache-control', 'no-cache');
    switch (req.url) {
        // если запрос к записям о рейсах, то пересылаем.
        case '/arriving.json': res.end(JSON.stringify(arrivingFlights) );
        break;

        case '/deriving.json': res.end(JSON.stringify(derivingFlights) );
        break;

        // иначе обрабатываем как запрос к файлу.
        default: file.serve(req, res);
        break;
    }
    console.log(req.url);
});

// процедура считывания данных с сайта flightradar24.
function getFlights (direction) {
    let url = 'https://www.flightradar24.com/data/airports/svo/' + direction;

    // Для scrappinga используем стандартный синтаксис модуля puppeteer
    return new Promise( (res, rej) => {
        puppeteer
            .launch()
            .then(function(browser) {
                console.log('Puppeter launched');
                return browser.newPage();
            })
            .then(function(page) {
                console.log('Puppeter new page in browser');
                return page.goto(url).then(function() {
                    console.log('Puppeter url opened');
                    return page.content();
                });
            })
            .then(function(html) {
                //console.log(html);
                let flights = parseFlights(html);
                //console.log(flights);
                if (flights.length === 0) {
                    throw new Error(`Empty data`);
                } else {
                    res(flights);
                }
            })
            .catch(function(err) {
                console.error(err);
                rej();
            });
    });

}

// Процедура изъятия данных.
function parseFlights (html) {
    let array = [];

    try {
        // Модуль cheerio позволяет получить объект, с информацией о DOM структуре.
        let flights = $('tr.hidden-xs.hidden-sm.ng-scope', html);

        for (let i = 0; i < flights.length; i++) {

            let flight = {};

            //К сожалению модуль cheerio не имеет удобных методов последовательного поиска, поэтому
            //для ускорения поиска используем следующую навигацию по элементам DOM, в ущерб семантики кода:

            flight.time = flights[i].children[0].children[0].data;
            let length = flights[i].children[1].children.length;
            flight.flightNumber = flights[i].children[1].children[length - 1].children[0].data;
            flight.airport = flights[i].children[2].children[0].children[0].children[0].data;
            flight.airportIndex = flights[i].children[2].children[0].children[1].children[0].data;
            flight.airline = flights[i].children[3].children[0].children[0].data;
            flight.aircraft = flights[i].children[4].children[0].children[0].data;
            flight.status = flights[i].children[6].children[0].children[0].data;
            flight.statusTime = flights[i].children[6].children[1].data;

            array.push(flight);
            //console.log(flight);

        }
    } catch (e) {
        console.log ('Could not read properties, err: ', e);
    }
    console.log('complete parsing FLights');

    return array;
}