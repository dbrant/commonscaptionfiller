// Dmitry Brant, 2019.

const nodemw = require('nodemw');
const https = require('https');
const querystring = require('querystring');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

let api = new nodemw({
    "protocol": "https",
    "server": "commons.wikimedia.org",
    "path": "/w",
    "debug": false,
    "userAgent": "DBrantBot v1",
});


// examples:
//File:Katowice_-_Sezamkowa_Street_(2).jpg
//File:Croix cimetière Monument morts St Loup Varennes 1.jpg
//File:Alexandra Park - geograph.org.uk - 1774297.jpg
//File:Park_Point_Beach,_Duluth_(36277254826).jpg
//File:La couverture du Disque de François Lougah ( au Zaïre ) vue de dos.jpg


main();


async function main() {

    let quantity = 1;
    let username = "";
    let password = "";
    let token = '+\\';

    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--user') {
            username = process.argv[i + 1];
        } else if (process.argv[i] === '--pass') {
            password = process.argv[i + 1];
        } else if (process.argv[i] === '--count') {
            quantity = parseInt(process.argv[i + 1]);
        }
    }

    if (username.length > 0) {
        console.log("Logging in as " + username);
        await login(username, password);

        console.log("Getting CSRF token...");
        token = await getCsrfToken();
    } else {
        console.log("Working anonymously...");
    }

    let pages = await getRandomPages(quantity);
    for (let i = 0; i < pages.length; i++) {
        let title = pages[i];

        console.log("Processing page: " + title);

        let labels = await getLabelsForPage(title);
        for (let lang in labels) {
            if (!labels.hasOwnProperty(lang)) {
                continue;
            }
            console.log(">>> Existing label: " + lang + ": " + labels[lang].value);
        }

        let descriptions = getDescriptionsFromPage(await getPageContents(title));

        for (let lang in descriptions) {
            if (!descriptions.hasOwnProperty(lang)) {
                continue;
            }

            if (labels.hasOwnProperty(lang)) {
                console.log(">>> Label already exists for language: " + lang);
                continue;
            }

            console.log(">>>>> Setting new description: " + lang + ": " + descriptions[lang]);
            await setPageLabel(title, lang, descriptions[lang], token);
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
                reject("error");
                return;
            }
            console.log("Set label success.");
            resolve("success");
        }, 'POST');
    });
}

function getDescriptionsFromPage(text) {
    let descriptions = {};
    const document = (new JSDOM(text)).window.document;
    let descTable = document.querySelector("td.description");
    if (descTable) {
        let haveOne = false;

        for (let n = 0; n < descTable.childNodes.length; n++) {
            let node = descTable.childNodes[n];

            // Look for direct child nodes that are divs with a specific class.
            if (node.tagName !== 'DIV') {
                continue;
            }
            if (!node.classList.contains('description')) {
                continue;
            }
            // If the description contains list(s), it's probably too complex for us.
            if (descTable.querySelectorAll("li").length > 0) {
                continue;
            }
            haveOne = true;

            let lang = 'en';
            if (node.hasAttribute("lang")) {
                lang = node.getAttribute("lang");
            }

            // Strip away any "Language" labels, which are usually spans.
            let langLabel = node.querySelector("span.language");
            if (langLabel) {
                node.removeChild(langLabel);
            }
            langLabel = node.querySelector("[class^='langlabel']");
            if (langLabel) {
                node.removeChild(langLabel);
            }

            let desc = massageDescription(node.textContent);
            if (!descriptions.hasOwnProperty(lang) && isDescriptionWorthy(desc)) {
                descriptions[lang] = desc;
            }
        }

        if (!haveOne) {
            // If the description itself contains table(s), then forget about it.
            let badElements = descTable.querySelectorAll("table");
            if (badElements.length == 0) {
                let desc = massageDescription(descTable.textContent);
                if (isDescriptionWorthy(desc)) {
                    descriptions["en"] = desc;
                }
            }
        }
    }
    return descriptions;
}

function massageDescription(description) {
    return description.trim().replace("\n", "").replace("\r", "").replace("\t", " ");
}

function isDescriptionWorthy(description) {
    return description.length > 4 && description.length < 250
        && description.indexOf("</a>") === -1 && description.indexOf("</li>") === -1
        && description.indexOf("http://") === -1 && description.indexOf("https://") === -1
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
                return;
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
        api.logIn(username, password, function(err, res) {
            if (err) {
                console.log("Login failed: " + err);
                reject("Login failed.");
                return;
            }
            console.log("Logged in successfully!");
            resolve("Login success.");
        });
    });
}
