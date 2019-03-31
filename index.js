

const nodemw = require('nodemw');
const https = require('https');
const querystring = require('querystring');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const API_PATH = "/w/api.php?format=json&formatversion=2&";
const API_DOMAIN_PATH = "https://commons.wikimedia.org" + API_PATH;

let api = new nodemw({
    "protocol": "https",  // default to 'http'
    "server": "commons.wikimedia.org",  // host name of MediaWiki-powered site
    "path": "/w",                  // path to api.php script
    "debug": false,                // is more verbose when set to true
    "userAgent": "DBrantBot",      // define custom bot's user agent
});


// examples:
//File:Katowice_-_Sezamkowa_Street_(2).jpg
//File:Croix cimetière Monument morts St Loup Varennes 1.jpg
//File:Alexandra Park - geograph.org.uk - 1774297.jpg
//File:Park_Point_Beach,_Duluth_(36277254826).jpg
//File:La couverture du Disque de François Lougah ( au Zaïre ) vue de dos.jpg


main();


async function main() {

    let username = "";
    let password = "";
    let token = '+\\';

    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--user') {
            username = process.argv[i + 1];
        } else if (process.argv[i] === '--pass') {
            password = process.argv[i + 1];
        }
    }

    if (username.length > 0) {
        console.log("Logging in as " + username);
        await login(username, password);

        console.log("Getting CSRF token...");
        token = await getCsrfToken();
    }

    let pages = await getRandomPages(5);
    for (let i = 0; i < pages.length; i++) {
        let title = pages[i];

        console.log("Processing labels: " + title);
        let labels = await getLabelsForPage(title);
        for (let lang in labels) {
            if (!labels.hasOwnProperty(lang)) {
                continue;
            }
            console.log(">>> Existing label: " + lang + ": " + labels[lang].value);
        }

        console.log("Processing page: " + title);
        let descriptions = await getDescriptionsFromPage(title);

        for (let lang in descriptions) {
            if (!descriptions.hasOwnProperty(lang)) {
                continue;
            }

            if (labels.hasOwnProperty(lang)) {
                console.log(">>> Label already exists for language: " + lang);
                continue;
            }

            console.log(">>>>> Setting new description: " + lang + ": " + descriptions[lang]);
            //await setPageLabel(title, lang, descriptions[lang], token);
        }
    }
}


async function setPageLabel(title, lang, label, token) {
    return new Promise(function(resolve, reject) {
        api.api.call(params = {
            action: 'wbsetlabel',
            site: 'commonswiki',
            title: title,
            language: lang,
            value: label,
            token: token
        }, function(err, response) {
            if (err) {
                console.error("Set label failed: " + err);
                reject({});
            }
            console.log("Set label success.");
        }, 'POST');
    });
}

async function getDescriptionsFromPage(title) {
    let text = await getPageContents(title);
    let descriptions = {};
    const document = (new JSDOM(text)).window.document;
    let descTable = document.querySelector("td.description");
    return new Promise(function(resolve, reject) {
        if (descTable) {
            let elements = descTable.querySelectorAll("div.description");
            if (elements && elements.length > 0) {
                for (let i = 0; i < elements.length; i++) {
                    let element = elements[i];

                    let lang = 'en';
                    if (element.hasAttribute("lang")) {
                        lang = element.getAttribute("lang");
                    }

                    let langLabel = element.querySelector("span.language");
                    if (langLabel) {
                        element.removeChild(langLabel);
                    }
                    let desc = elements[i].textContent.trim().replace("\n", "").replace("\r", "").replace("\t", " ");
                    if (!descriptions.hasOwnProperty(lang) && isDescriptionWorthy(desc)) {
                        descriptions[lang] = desc;
                    }
                }
            } else {
                let desc = descTable.textContent.trim().replace("\n", "").replace("\r", "").replace("\t", " ");
                if (isDescriptionWorthy(desc)) {
                    descriptions["en"] = desc;
                }
            }
        }
        resolve(descriptions);
    });
}

function isDescriptionWorthy(description) {
    return description.length > 4 && description.length < 1024
        && description.indexOf("</a>") === -1 && description.indexOf("</li>") === -1;
}

function getLabelsForPage(title) {
    return new Promise(function(resolve, reject) {
        api.api.call(params = {
            formatversion: 2,
            action: 'wbgetentities',
            sites: 'commonswiki',
            props: 'labels',
            titles: title
        }, function(err, resp, next, rawData) {
            if (!rawData.entities) {
                console.error("Labels API response looks malformed.");
                resolve({});
            }
            for (let entityId in rawData.entities) {
                let entity = rawData.entities[entityId];
                resolve(entity.labels || {});
                break;
            }
        });
    });
}

function getRandomPages(amount) {
    return new Promise(function(resolve, reject) {
        api.api.call(params = {
            formatversion: 2,
            action: 'query',
            generator: 'random',
            grnnamespace: 6,
            grnlimit: amount
        }, function(err, response) {
            let pages = [];
            for (let pageId in response.pages) {
                if (response.pages.hasOwnProperty(pageId)) {
                    pages.push(response.pages[pageId].title);
                }
            }
            resolve(pages);
        });
    });
}

function getPageContents(title) {
    return new Promise(function(resolve, reject) {
        api.api.call(params = {
            formatversion: 2,
            action: 'parse',
            page: title
        }, function(err, resp, next, rawData) {
            resolve(rawData.parse.text);
        });
    });
}

function getCsrfToken() {
    return new Promise(function(resolve, reject) {
        api.api.call(params = {
            formatversion: 2,
            action: 'query',
            meta: 'tokens'
        }, function(err, response) {
            resolve(response.tokens.csrftoken);
        })
    });
}

function login(username, password) {
    return new Promise(function(resolve, reject) {
        api.logIn(process.argv[2], process.argv[3], function(err, res) {
            if (err) {
                console.log("Login failed: " + err);
                reject("Login failed.");
            }
            console.log("Logged in successfully!");
            resolve("Login success.");
        });
    });
}
