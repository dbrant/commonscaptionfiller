

const https = require('https');
const querystring = require('querystring');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

//File:Katowice_-_Sezamkowa_Street_(2).jpg
//File:Croix cimetière Monument morts St Loup Varennes 1.jpg
//File:Alexandra Park - geograph.org.uk - 1774297.jpg
//File:Park_Point_Beach,_Duluth_(36277254826).jpg
//File:La couverture du Disque de François Lougah ( au Zaïre ) vue de dos.jpg

/*
getDescriptionsFromPage('File:Croix cimetière Monument morts St Loup Varennes 1.jpg', function(title, lang, description) {
    console.log(">>> " + lang + ": " + description);
    console.log("length: " + description.length);
    
    setPageLabel(title, lang, description);

});
*/


//getRandomPages(10, function(title) {
//    console.log(">>>>> " + title);
//});



main();


async function main() {
    let pages = await getRandomPages(1);
    for (let i = 0; i < pages.length; i++) {
        let title = pages[i];

        //title = "File:Croix cimetière Monument morts St Loup Varennes 1.jpg";

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

            await setPageLabel(title, lang, descriptions[lang]);
        }
    }
}



async function setPageLabel(title, lang, label) {
    let postData = querystring.stringify({
        'site': 'commonswiki',
        'title': title,
        'language': lang,
        'value': label,
        'token': '+\\'
    });

    let options = {
        hostname: 'commons.wikimedia.org',
        path: '/w/api.php?action=wbsetlabel&format=json&formatversion=2',
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
    return description.indexOf("</a>") === -1 && description.indexOf("</li>");
}

function getLabelsForPage(title) {
    return new Promise(function(resolve, reject) {
        callApi('https://commons.wikimedia.org/w/api.php?formatversion=2&format=json&action=wbgetentities&sites=commonswiki&props=labels&titles=' + encodeURIComponent(title),
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
        callApi('https://commons.wikimedia.org/w/api.php?formatversion=2&format=json&action=query&generator=random&grnnamespace=6&grnlimit=' + amount,
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

function getPageContents(title) {
    let contents = "";
    return new Promise(function(resolve, reject) {
        callApi('https://commons.wikimedia.org/w/api.php?formatversion=2&format=json&action=parse&page=' + encodeURIComponent(title),
            function (response) {
                contents = response.parse.text;
                resolve(contents);
            }
        );
    });
}

function callApi(url, callback) {
    https.get(url, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

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



