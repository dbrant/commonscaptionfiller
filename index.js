//
// This script requests random pages from Commons and populates their structured caption (label) field
// based on the unstructured description template that may or may not be present in the page contents.
//
// Dmitry Brant, 2019.
//

const readline = require('readline');
const nodemw = require('nodemw');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

let api = new nodemw({
    "protocol": "https",
    "server": "commons.wikimedia.org",
    "path": "/w",
    "debug": false,
    "userAgent": "DBrantBot v1",
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// examples with diverse types of unstructured description boxes:
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
    let dryRun = false;

    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--user') {
            username = process.argv[i + 1];
        } else if (process.argv[i] === '--pass') {
            password = process.argv[i + 1];
        } else if (process.argv[i] === '--count') {
            quantity = parseInt(process.argv[i + 1]);
        } else if (process.argv[i] === '--dry') {
            dryRun = true;
        }
    }

    if (username.length > 0) {
        console.log("Logging in as " + username);
        await login(username, password).catch(function (err) { console.error(err); });

        console.log("Getting CSRF token...");
        token = await getCsrfToken();
    } else {
        console.log("Working anonymously...");
    }




    /*
    for (let hour = 1; hour <= 12; hour++) {
        for (let minute = 0; minute < 60; minute++) {
            let hourStr = hour.toString();
            if (hourStr.length === 1) { hourStr = "0" + hourStr; }
            let minuteStr = minute.toString();
            if (minuteStr.length === 1) { minuteStr = "0" + minuteStr; }

            let pageTitle = "File:Clock_" + hourStr + "-" + minuteStr + ".svg";

            await performOperationForPage(pageTitle, token);
            return;
        }
    }
    return;
    */




    let pagesLeft = quantity;
    let pagesAtATime = 50;

    while (pagesLeft > 0) {
        let pagesToGet = pagesLeft;
        if (pagesToGet > pagesAtATime) {
            pagesToGet = pagesAtATime;
        }
        pagesLeft -= pagesToGet;

        let pages = await getRandomPages(pagesToGet).catch(function (err) { console.error(err); });

        for (let i = 0; i < pages.length; i++) {
            let title = pages[i];

            await performOperationForPage(title, token);
        }
    }
}

async function performOperationForPage(title, token, dryRun = false) {
    console.log("--------------------------------");
    console.log("Processing page: " + title);

    return new Promise(async function(resolve, reject) {
        let descriptions = getDescriptionsFromPage(await getPageContents(title));
        if (Object.keys(descriptions).length === 0) {
            resolve();
            return;
        }

        let labels = await getLabelsForPage(title).catch(function (err) {
            console.error(err);
        });

        for (let lang in descriptions) {
            if (!descriptions.hasOwnProperty(lang)) {
                continue;
            }

            if (labels.hasOwnProperty(lang)) {
                console.log(">>> Label already exists for language: " + lang);
                continue;
            }

            if (!dryRun) {
                console.log(">>> Description: " + lang + ": " + descriptions[lang]);

                if (!(await confirmYesNo("Would you like to apply it? (y/n) [n]"))) {
                    continue;
                }

                await setPageLabel(title, lang, descriptions[lang], token).catch(function (err) {
                    console.error(err);
                });
            }
        }
        resolve();
    });
}

async function confirmYesNo(message) {
    return new Promise(function(resolve, reject) {
        rl.question(message + " > ", (answer) => {
            resolve(answer === 'y' || answer === 'Y');
            //rl.close();
        });
    });
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
            // Check if the description is too presentationally complex for us...
            if (descTable.querySelectorAll("li").length > 0 || descTable.querySelectorAll("p").length > 0) {
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

            // Not quite fully baked:
            // What to do if we don't have any div.description nodes?
            // Should we treat the whole field as an English description? etc.
            /*
            // If the description itself contains table(s), then forget about it.
            let badElements = descTable.querySelectorAll("table");
            if (badElements.length == 0) {
                let desc = massageDescription(descTable.textContent);
                if (isDescriptionWorthy(desc)) {
                    descriptions["en"] = desc;
                }
            }
            */
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
