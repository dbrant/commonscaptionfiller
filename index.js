

const https = require('https');
const querystring = require('querystring');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const API_PATH = "/w/api.php?format=json&formatversion=2&";
const API_DOMAIN_PATH = "https://commons.wikimedia.org" + API_PATH;

let Cookie = "";

// examples:
//File:Katowice_-_Sezamkowa_Street_(2).jpg
//File:Croix cimetière Monument morts St Loup Varennes 1.jpg
//File:Alexandra Park - geograph.org.uk - 1774297.jpg
//File:Park_Point_Beach,_Duluth_(36277254826).jpg
//File:La couverture du Disque de François Lougah ( au Zaïre ) vue de dos.jpg


main();


async function main() {




    let logintoken = await getLoginToken();
    console.log("Login token: " + logintoken);
    await login(..., ..., logintoken);



    console.log("Getting CSRF token...");
    let token = await getCsrfToken(); // '+\\';
    console.log("Token: " + token);





    let pages = await getRandomPages(1);
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
    let postData = querystring.stringify({
        'site': 'commonswiki',
        'title': title,
        'language': lang,
        'value': label,
        'token': token
    });

    let options = {
        hostname: 'commons.wikimedia.org',
        path: API_PATH + 'action=wbsetlabel',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };

    return new Promise(function(resolve, reject) {
        let req = https.request(options, (res) => {
            console.log('statusCode:', res.statusCode);
            let rawData = '';
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {
                resolve(rawData);
            });
        });

        req.on('error', (e) => {
            console.error(e);
        });
        req.write(postData);
        req.end();
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
        callApi(API_DOMAIN_PATH + 'action=wbgetentities&sites=commonswiki&props=labels&titles=' + encodeURIComponent(title),
            function (response) {
                if (!response.entities) {
                    console.error("Labels API response looks malformed.");
                    resolve({});
                }
                for (let entityId in response.entities) {
                    let entity = response.entities[entityId];
                    resolve(entity.labels || {});
                }
            }
        );
    });
}

function getRandomPages(amount) {
    let pages = [];
    return new Promise(function(resolve, reject) {
        callApi(API_DOMAIN_PATH + 'action=query&generator=random&grnnamespace=6&grnlimit=' + amount,
            function (response) {
                if (!response.query || !response.query.pages) {
                    console.error("Random API response looks malformed.");
                    return;
                }
                for (let pageId in response.query.pages) {
                    if (response.query.pages.hasOwnProperty(pageId)) {
                        pages.push(response.query.pages[pageId].title);
                    }
                }
                resolve(pages);
            }
        );
    });
}

function getCsrfToken() {
    return new Promise(function(resolve, reject) {
        callApi(API_DOMAIN_PATH + 'action=query&meta=tokens',
            function (response) {
                if (!response.query || !response.query.tokens) {
                    console.error("Tokens API response looks malformed.");
                    resolve({});
                }
                resolve(response.query.tokens.csrftoken);
            }
        );
    });
}

function getLoginToken() {
    return new Promise(function(resolve, reject) {
        callApi(API_DOMAIN_PATH + 'action=query&meta=tokens&type=login',
            function (response) {
                if (!response.query || !response.query.tokens) {
                    console.error("Tokens API response looks malformed.");
                    resolve({});
                }
                resolve(response.query.tokens.logintoken);
            }
        );
    });
}

function login(username, password, token) {
    let postData = "username=" + username + "&password=" + password + "&logintoken=" + encodeURIComponent(token) + "&loginreturnurl=https://wikipedia.org";
    console.log(postData);

    let options = {
        hostname: 'commons.wikimedia.org',
        path: API_PATH + "action=clientlogin",
        method: 'POST',
        headers: {
            'Cookie': Cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };

    return new Promise(function(resolve, reject) {
        let req = https.request(options, (res) => {
            console.log('statusCode:', res.statusCode);
            let rawData = '';
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {

                console.log(rawData);

                let response = JSON.parse(rawData);

                if (!response.clientlogin || response.clientlogin.status !== 'PASS') {
                    console.error("Login failed.");
                    resolve({});
                }
                resolve(response.login);
            });
        });

        req.on('error', (e) => {
            console.error(e);
        });
        req.write(postData);
        req.end();
    });
}

function getPageContents(title) {
    let contents = "";
    return new Promise(function(resolve, reject) {
        callApi(API_DOMAIN_PATH + 'action=parse&page=' + encodeURIComponent(title),
            function (response) {
                contents = response.parse.text;
                resolve(contents);
            }
        );
    });
}

function callApi(url, callback) {
    // TODO: pass cookie in headers~!
    https.get(url, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

        if (res.headers.hasOwnProperty('set-cookie')) {

            console.log(">>>>>>> COOKIE: " + res.headers['set-cookie']);

            Cookie = Cookie.length > 0 ? (Cookie + "; " + res.headers['set-cookie']) : res.headers['set-cookie'];
        }

        let error;
        if (statusCode !== 200) {
            error = new Error('Request Failed.\n' +
                            `Status Code: ${statusCode}`);
        } else if (!/^application\/json/.test(contentType)) {
            error = new Error('Invalid content-type.\n' +
                            `Expected application/json but received ${contentType}`);
        }
        if (error) {
            console.error(error.message);
            // Consume response data to free up memory
            res.resume();
            return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                let response = JSON.parse(rawData);
                if (response.error) {
                    console.error(">>> API request failed: " + response.error.info);
                } else {
                    callback(response);
                }
            } catch (e) {
                console.error(e.message);
            }
        });
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
    });
}



