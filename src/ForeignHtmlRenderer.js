/**
 * 
 * @param {StyleSheetList} styleSheets 
 */
const ForeignHtmlRenderer = function(styleSheets) {
    
    const self = this;

    /**
     * 
     * @param {String} binStr 
     */
    const binaryStringToBase64 = function(binStr) {
        return new Promise(function(resolve) {
            const reader = new FileReader();
            reader.readAsDataURL(binStr); 
            reader.onloadend = function() {
                resolve(reader.result);
            }  
        });     
    };

    /**
     * 
     * @param {String} url 
     * @returns {Promise}
     */
    const getResourceAsBase64 = function(url) {
        return new Promise(function(resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.responseType = 'blob';

            xhr.onreadystatechange = async function() {
                if(xhr.readyState === 4 && xhr.status === 200) {
                    const resBase64 = await binaryStringToBase64(xhr.response);
                    resolve(
                        {
                            "resourceUrl": url,
                            "resourceBase64": resBase64
                        }
                    );
                }
            };

            xhr.send(null);
        });
    };

    /**
     * 
     * @param {String[]} urls 
     * @returns {Promise}
     */
    const getMultipleResourcesAsBase64 = function(urls) {
        const promises = [];
        for(let i=0; i<urls.length; i++) {
            promises.push( getResourceAsBase64(urls[i]) );
        }
        return Promise.all(promises);
    };

    /**
     * 
     * @param {String} str 
     * @param {Number} startIndex 
     * @param {String} prefixToken 
     * @param {String[]} suffixTokens
     * 
     * @returns {String|null} 
     */
    const parseValue = function(str, startIndex, prefixToken, suffixTokens) {
        const idx = str.indexOf(prefixToken, startIndex);
        if(idx === -1) {
            return null;
        }

        let val = '';
        for(let i=idx+prefixToken.length; i<str.length; i++) {
            if(suffixTokens.indexOf(str[i]) !== -1) {
                break;
            }

            val += str[i];
        }

        return {
            "foundAtIndex": idx,
            "value": val
        }
    };

    /**
     * 
     * @param {String} cssRuleStr 
     * @returns {String[]}
     */
    const getUrlsFromCssString = function(cssRuleStr) {
        const urlsFound = [];
        let searchStartIndex = 0;

        while(true) {
            const url = parseValue(cssRuleStr, searchStartIndex, "url(", [')']);
            if(url === null) {
                break;
            }

            searchStartIndex = url.foundAtIndex + url.value.length;
            urlsFound.push(removeQuotes(url.value));
        }

        return urlsFound;
    };    

    /**
     * 
     * @param {String} html 
     * @returns {String[]}
     */
    const getImageUrlsFromFromHtml = function(html) {
        const urlsFound = [];
        let searchStartIndex = 0;

        while(true) {
            const url = parseValue(html, searchStartIndex, 'src=', [' ', '>', '\t']);
            if(url === null) {
                break;
            }

            searchStartIndex = url.foundAtIndex + url.value.length;
            urlsFound.push(removeQuotes(url.value));
        }

        return urlsFound;
    };

    /**
     * 
     * @param {String} str
     * @returns {String}
     */
    const removeQuotes = function(str) {
        return str.replace(/["']/g, "");
    };

    const escapeRegExp = function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    };

    /**
     * 
     * @param {String} contentHtml 
     * @param {Number} width
     * @param {Number} height
     * 
     * @returns {Promise<String>}
     */
    const buildSvgDataUri = async function(contentHtml, width, height) {

        return new Promise(async function(resolve, reject) {

            /* !! The problems !!
            *  1. CORS (not really an issue, expect perhaps for images, as this is a general security consideration to begin with)
            *  2. Platform won't wait for external assets to load (fonts, images, etc.)
            */ 

            // copy styles
            let cssStyles = "";
            let urlsFoundInCss = [];

            for (let i=0; i<styleSheets.length; i++) {
                for(let j=0; j<styleSheets[i].cssRules.length; j++) {
                    const cssRuleStr = styleSheets[i].cssRules[j].cssText;
                    urlsFoundInCss.push( ...getUrlsFromCssString(cssRuleStr) );
                    cssStyles += cssRuleStr;
                }
            }

            const fetchedResourcesFromStylesheets = await getMultipleResourcesAsBase64(urlsFoundInCss);
            for(let i=0; i<fetchedResourcesFromStylesheets.length; i++) {
                const r = fetchedResourcesFromStylesheets[i];
                cssStyles = cssStyles.replace(new RegExp(escapeRegExp(r.resourceUrl),"g"), r.resourceBase64);
            }

            let urlsFoundInHtml = getImageUrlsFromFromHtml(contentHtml);
            const fetchedResources = await getMultipleResourcesAsBase64(urlsFoundInHtml);
            for(let i=0; i<fetchedResources.length; i++) {
                const r = fetchedResources[i];
                contentHtml = contentHtml.replace(new RegExp(escapeRegExp(r.resourceUrl),"g"), r.resourceBase64);
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
            const svg = `
                <svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>
                    <g transform='translate(0, 0) rotate(0)'>
                        <foreignObject x='0' y='0' width='${width}' height='${height}'>
                            ${contentRootElemString}
                        </foreignObject>
                    </g>
                </svg>`;

            // convert SVG to data-uri
            const dataUri = `data:image/svg+xml;base64,${window.btoa(svg)}`;

            resolve(dataUri);                    
        });
    };

    /**
     * @param {String} html
     * @param {Number} width
     * @param {Number} height
     * 
     * @return {Promise<Image>}
     */
    this.renderToImage = async function(html, width, height) {
        return new Promise(async function(resolve, reject) {
            const img = new Image();
            img.src = await buildSvgDataUri(html, width, height);
    
            img.onload = function() {
                resolve(img);
            };
        });
    };

    /**
     * @param {String} html
     * @param {Number} width
     * @param {Number} height
     * 
     * @return {Promise<Image>}
     */
    this.renderToCanvas = async function(html, width, height) {
        return new Promise(async function(resolve, reject) {
            const img = await self.renderToImage(html, width, height);

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const canvasCtx = canvas.getContext('2d');
            canvasCtx.drawImage(img, 0, 0, img.width, img.height);

            resolve(canvas);
        });
    };    

    /**
     * @param {String} html
     * @param {Number} width
     * @param {Number} height
     * 
     * @return {Promise<String>}
     */
    this.renderToBase64Png = async function(html, width, height) {
        return new Promise(async function(resolve, reject) {
            const canvas = await self.renderToCanvas(html, width, height);
            resolve(canvas.toDataURL('image/png'));
        });
    };

};
