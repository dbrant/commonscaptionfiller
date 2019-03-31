

const https = require('https');
const querystring = require('querystring');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

//File:Katowice_-_Sezamkowa_Street_(2).jpg
//File:Croix cimetière Monument morts St Loup Varennes 1.jpg
//File:Alexandra Park - geograph.org.uk - 1774297.jpg

getDescriptionsFromPage('File:Croix cimetière Monument morts St Loup Varennes 1.jpg', function(title, lang, description) {
    console.log(">>> " + lang + ": " + description);
    console.log("length: " + description.length);
    
    setPageLabel(title, lang, description);

});




function setPageLabel(title, lang, label) {
    var postData = querystring.stringify({
        'site' : 'commonswiki',
        'title' : title,
        'language' : lang,
        'value' : label,
        'token' : '+\\'
    });
    
    var options = {
      hostname: 'commons.wikimedia.org',
      path: '/w/api.php?action=wbsetlabel&format=json&formatversion=2',
      method: 'POST',
      headers: {
           'Content-Type': 'application/x-www-form-urlencoded',
           'Content-Length': postData.length
         }
    };
    
    var req = https.request(options, (res) => {
      console.log('statusCode:', res.statusCode);
      //console.log('headers:', res.headers);
    
      res.on('data', (d) => {
        process.stdout.write(d);
      });
    });
    
    req.on('error', (e) => {
      console.error(e);
    });
    
    req.write(postData);
    req.end();    
}





function getDescriptionsFromPage(title, callback) {
    getPageContents(title, function(text){
        const document = (new JSDOM(text)).window.document;
        let descTable = document.querySelector("td.description");
        if (descTable) {
            let elements = descTable.querySelectorAll("div.description");
    
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
    
                let description = elements[i].textContent.trim().replace("\n", "").replace("\r", "").replace("\t", " ");
                callback(title, lang, description);
            }
        }
    });
}

function getPageContents(title, callback) {
    callApi('https://commons.wikimedia.org/w/api.php?formatversion=2&format=json&action=parse&page=' + title,
        function (response) {
            callback(response.parse.text);
        }
    );
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
                callback(JSON.parse(rawData));
            } catch (e) {
                console.error(e.message);
            }
        });
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
    });
}



