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
     */
    const removeQuotes = function(str) {
        return str.replace(/["']/g, "");
    };    

    /**
     * 
     * @param {String} cssRuleStr 
     */
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

            urlsFound.push(removeQuotes(url));
        }

        return urlsFound;
    };    

    /**
     * 
     * @param {String} html 
     */
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

            urlsFound.push(removeQuotes(url));
        }

        return urlsFound;
    };

    /**
     * 
     * @param {String} contentHtml 
     */
    const buildSvgDataUri = async function(contentHtml) {

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
                cssStyles = cssStyles.replace(new RegExp(r.resourceUrl,"g"), r.resourceBase64);
            }

            let urlsFoundInHtml = getImageUrlsFromFromHtml(contentHtml);
            const fetchedResources = await getMultipleResourcesAsBase64(urlsFoundInHtml);
            for(let i=0; i<fetchedResources.length; i++) {
                const r = fetchedResources[i];
                contentHtml = contentHtml.replace(new RegExp(r.resourceUrl,"g"), r.resourceBase64);
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

    /**
     * @param {String} html
     * @return {Image}
     */
    this.renderToCanvas = async function(html) {
        return new Promise(async function(resolve, reject) {
            const img = await self.renderToImage(html);

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
     * @return {String}
     */
    this.renderToBase64Png = async function(html) {
        return new Promise(async function(resolve, reject) {
            const canvas = await self.renderToCanvas(html);
            resolve(canvas.toDataURL('image/png'));
        });
    };

};
