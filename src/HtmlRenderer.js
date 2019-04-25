const HtmlRenderer = function() {

    const binaryStringToBase64 = function(binStr) {
        return new Promise(function(resolve) {
            const reader = new FileReader();
            reader.readAsDataURL(binStr); 
            reader.onloadend = function() {
                resolve(reader.result);
            }  
        });     
    };

    const getResourceAsBase64 = function(url) {
        return new Promise(function(resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.responseType = 'blob';

            xhr.onreadystatechange = async function() {
                if(xhr.readyState === 4 && xhr.status === 200) {
                    const resBase64 = await binaryStringToBase64(xhr.response);
                    resolve(resBase64);
                }
            };

            xhr.send(null);
        });
    };

    const removeQutoes = function(str) {
        return str.replace(/["']/g, "");
    };    

    const getUrlsFromCssString = function(cssRuleStr) {
        const urlsFound = [];
        let searchStartIndex = 0;

        while(true) {
            const idx = cssRuleStr.indexOf("url(", searchStartIndex);
            if(idx === -1) {
                break;
            }

            let url = "";
            for(let i=idx+4; i<cssRuleStr.length; i++) {
                if(cssRuleStr[i] === ')') {
                    break;
                }
                url += cssRuleStr[i];
            }
            
            searchStartIndex = idx + 1;

            urlsFound.push(removeQutoes(url));
        }

        return urlsFound;
    };    

    const getImageUrlsFromFromHtml = function(html) {
        const urlsFound = [];
        let searchStartIndex = 0;

        while(true) {
            const idx = html.indexOf("src=", searchStartIndex);
            if(idx === -1) {
                break;
            }

            let url = "";
            for(let i=idx+5; i<html.length; i++) {
                if(html[i] === '"' || html[i] === "'") {
                    break;
                }
                url += html[i];
            }
            
            searchStartIndex = idx + 1;

            urlsFound.push(removeQutoes(url));
        }

        return urlsFound;
    };

    const buildSvgDataUri = async function(contentHtml) {

        return new Promise(async function(resolve, reject) {

            /* !! The problems !!
            *  1. CORS (not really an issue, expect perhaps for images, as this is a general security consideration to begin with)
            *  2. Platform won't wait for external assets to load (fonts, images, etc.)
            */ 

            // copy styles
            let cssStyles = "";
            let urlsFound = [];

            for (let i=0; i<document.styleSheets.length; i++) {
                for(let j=0; j<document.styleSheets[i].cssRules.length; j++) {
                    const cssRuleStr = document.styleSheets[i].cssRules[j].cssText;
                    urlsFound.push( ...getUrlsFromCssString(cssRuleStr) );
                    cssStyles += cssRuleStr;
                }
            }

            for(let i=0; i<urlsFound.length; i++) {
                const resBase64 = await getResourceAsBase64(urlsFound[i]);
                cssStyles = cssStyles.replace(new RegExp(urlsFound[i],"g"), resBase64);
            }

            let urlsFoundInHtml = getImageUrlsFromFromHtml(contentHtml);
            for(let i=0; i<urlsFoundInHtml.length; i++) {
                const resBase64 = await getResourceAsBase64(urlsFoundInHtml[i]);
                contentHtml = contentHtml.replace(new RegExp(urlsFoundInHtml[i],"g"), resBase64);
            }            

            const styleElem = document.createElement("style");
            styleElem.innerHTML = cssStyles;

            const styleElemString = new XMLSerializer().serializeToString(styleElem);

            // create DOM element string that encapsulates styles + content
            const contentRootElem = document.createElement("div");
            contentRootElem.innerHTML = styleElemString + contentHtml;
            contentRootElem.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

            const contentRootElemString = new XMLSerializer().serializeToString(contentRootElem);

            // build SVG string
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='960' height='850'><g transform='translate(0, 0) rotate(0)'><foreignObject x='0' y='0' width='800' height='800'>${contentRootElemString}</foreignObject></g></svg>`;

            // convert SVG to data-uri
            const dataUri = `data:image/svg+xml;base64,${window.btoa(svg)}`;

            resolve(dataUri);                    

        });
    };

    /**
     * @param {String} html
     * @return {Image}
     */
    this.renderToImage = async function(html) {
        return new Promise(async function(resolve, reject) {
            const img = new Image();
            img.src = await buildSvgDataUri(html);
    
            img.onload = function() {
                resolve(img);
            };
        });
    };
};
