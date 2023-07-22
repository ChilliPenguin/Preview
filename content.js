//State of the preview
const PopupStates = {
    Loading: 0,
    Failed: 1,
    Content: 2,
    NotTrusted: 3
}

popupElement = null;
popupElementContent = null;
popupShowing = false;

prev_target = null //current target/what the preview is hovering over
prev_src = "" //previous link that was shown (do we need to reload?/send another request)
currentLink = "" //current link that is being previewed
current_target = null //What the mouse is hovering
currentTimeout = null
var httpRequest = null
var resizing = false //are we resizing the preview(called also popup)? If so don't hide the popup if the mouse leaves the popup region


//loads the preview when it loads onto the page
$.get(chrome.runtime.getURL('/popup.html'), function (data) {
    //adds popup to page
    $($.parseHTML(data)).appendTo('body');
    popupElement = document.getElementById("HyperlinkPreview-Popup")
    popupElementContent = document.getElementById("HyperlinkPreview-Popup-content")


    //sets instructions for the trust buttons
    $("#HyperlinkPreview-TrustButton").click(function (data) {
        if (currentLink != "") {

            chrome.storage.sync.get({
                authroizedLinks: []
            }, function (result) {
                var authroizedLinks = result.authroizedLinks;
                authroizedLinks.push({
                    link: currentLink,
                    authorized: true
                });
                chrome.storage.sync.set({
                    authroizedLinks: authroizedLinks
                }).then(result => {
                    launchRequest(prev_target)
                })
            })

        }

    })

    $("#HyperlinkPreview-DontTrustButton").click(function (data) {
        if (currentLink != "") {

            chrome.storage.sync.get({
                authroizedLinks: []
            }, function (result) {
                var authroizedLinks = result.authroizedLinks;
                authroizedLinks.push({
                    link: currentLink,
                    authorized: false
                });
                chrome.storage.sync.set({
                    authroizedLinks: authroizedLinks
                }).then(result => {
                    hidePopup()
                })
            })

        }

    })


    //sets the closebutton x image
    $("#HyperlinkPreview-TopNav-CloseButton").attr("src", chrome.runtime.getURL("images/xIcon.svg"))

    //hide popup if the close button is hit
    $("#HyperlinkPreview-IconButton").click(function (data) {
        hidePopup()
    })

    //get if the IFrame is allowed to run scripts
    $("#HyperlinkPreview-ScriptingAuth").change(function () {

        var scriptingAllowed = $("#HyperlinkPreview-ScriptingAuth").is(':checked')
        setIFrameScripting(scriptingAllowed)

        chrome.storage.sync.set({
            scriptingAllowed: scriptingAllowed
        })

    })

    //get initial state of scriptauth
    chrome.storage.sync.get({
        scriptingAllowed: false
    }, function (result) {
        var scriptingAllowed = result.scriptingAllowed;
        $("#HyperlinkPreview-ScriptingAuth").prop("checked", scriptingAllowed)
        setIFrameScripting(scriptingAllowed, false)
    })

    //loads jquery ui css
    $("#HyperlinkPreview-JQueryUI").prop("href", chrome.runtime.getURL("thirdPartyScripts/jquery-ui.min.css"))

    //set the states of popup
    showLoading()
    hideContent()
    hideForbidden()
    hideNotTrusted()
    resetResizable("n", "e")

});


//reposition popup if user scrolls the page
document.addEventListener("scroll", function (e) {
    if (popupShowing) {
        positionPopup(prev_target)
    }
})

//main event, looks at what the mouse is currently hovering and provides a popup if its a tag 
document.addEventListener("mousemove", function (e) {

    current_target = e.target

    var currentTargetParent = current_target.closest("a")

    //Hide preview box if mouse is too far away from preview
    if (prev_target != null && currentTargetParent != null) {
        var targetPos = currentTargetParent.getBoundingClientRect()
        var selectionPos = prev_target.getBoundingClientRect()
        if (currentTimeout != null && Math.sqrt(Math.pow(selectionPos.x - targetPos.x, 2) + Math.pow(selectionPos.y - targetPos.y, 2)) > 500 && !resizing) {
            hideContent()
            hidePopup()
        }
    }

    //Makes sure the user can make the IFrame smaller without the IFrame from stealing the focus
    if (resizing) {
        $(popupElementContent).css("pointer-events", "none")
    } else {
        $(popupElementContent).css("pointer-events", "auto")
    }

    //clear the timeout if needbe (user must hover and not move mouse to see preview launch)
    if (currentTimeout != null) {
        clearTimeout(currentTimeout)
    }
    currentTimeout = setTimeout(function () {
        //does the same above basically
        var elementLoopParent = current_target.closest("a")

        if (elementLoopParent == null && current_target.closest("#HyperlinkPreview-Popup") == null && !resizing) {
            hidePopup()

        }
        if (elementLoopParent != null) {
            //checks if the popup needs to be refreshed
            if (elementLoopParent == prev_target) {
                return;
            }
            prev_target = elementLoopParent


            //checks again if a refresh is needed by seeing if the href link is the same (or is the same but just has data in the URL (# info))
            if (elementLoopParent.href != prev_src && worthyPreview(elementLoopParent.href)) {
                changeState(PopupStates.Loading)
                positionPopup(elementLoopParent)
                showPopup()

                //Gets the base url and displays it
                let baseURL = getBaseUrl(elementLoopParent.href)
                currentLink = baseURL
                $("#HyperlinkPreview-WebsiteViewingPrompt").html("Viewing: " + baseURL)

                //Checks if the link has been authorized to use by the user 
                chrome.storage.sync.get("authroizedLinks", ({
                    authroizedLinks
                }) => {
                    webObject = authroizedLinks.find(element => element.link == baseURL)
                    if (webObject == null || webObject.authorized != true) {
                        $("#HyperlinkPreview-Popup-trust-link").html(baseURL)
                        if (webObject != null && webObject.authorized == false) {
                            $("#HyperlinkPreview-Popup-trust-warning").css("display", "block")
                        } else {
                            $("#HyperlinkPreview-Popup-trust-warning").css("display", "none")
                        }
                        changeState(PopupStates.NotTrusted)
                    } else {
                        launchRequest(elementLoopParent)
                    }

                    prev_src = elementLoopParent.href
                })


            }

        } else if (current_target.closest("#HyperlinkPreview-Popup") == null && !resizing) {
            hidePopup()
            currentTimeout = null

        }
    }, 750)

})

//checks if the mouse is down or up (determines resizing)
document.addEventListener("mousedown", setPrimaryButtonState);
document.addEventListener("mousemove", setPrimaryButtonState);
document.addEventListener("mouseup", setPrimaryButtonState);


function hidePopup() {
    prev_target = null;
    prev_src = ""
    popupShowing = false
    changeState(PopupStates.Loading)
    popupElement.style["display"] = "none"
}

function showPopup() {
    popupShowing = true
    popupElement.style["display"] = "block"
}


function showLoading() {
    $("#HyperlinkPreview-Popup-loading").css("display", "block");
}

function hideLoading() {
    $("#HyperlinkPreview-Popup-loading").css("display", "none");
}

function showForbidden() {
    $("#HyperlinkPreview-Popup-forbidden").css("display", "block");
}

function hideForbidden() {
    $("#HyperlinkPreview-Popup-forbidden").css("display", "none");
}

function showContent() {
    $("#HyperlinkPreview-Popup-ContentHelper").css("display", "block");
}

function hideContent() {
    $("#HyperlinkPreview-Popup-ContentHelper").css("display", "none");
}

function showNotTrusted() {
    $("#HyperlinkPreview-Popup-trust").css("display", "flex");

}

function hideNotTrusted() {
    $("#HyperlinkPreview-Popup-trust").css("display", "none");

}

var currentState = PopupStates.Loading

function changeState(stateToChange, data = {}) {

    switch (currentState) {
        case PopupStates.Content: {
            hideContent()
            break;
        }
        case PopupStates.Loading: {
            hideLoading()
            break;
        }
        case PopupStates.Failed: {
            hideForbidden()
            break;
        }
        case PopupStates.NotTrusted: {
            hideNotTrusted()
            break;
        }
    }
    switch (stateToChange) {
        case PopupStates.Content: {
            showContent()
            break;
        }
        case PopupStates.Loading: {
            showLoading()
            break;
        }
        case PopupStates.Failed: {
            showForbidden()
            break;
        }
        case PopupStates.NotTrusted: {
            showNotTrusted()
            break;
        }
    }
    currentState = stateToChange //updates state
    if (prev_target != null) {
        positionPopup(prev_target) //must be done as state changes the popup size
    }
}



var primaryMouseButtonDown = false;

function setPrimaryButtonState(e) {
    var flags = e.buttons !== undefined ? e.buttons : e.which;
    primaryMouseButtonDown = (flags & 1) === 1;
    if (primaryMouseButtonDown == false) {
        resizing = false; //resets resizing cuz its not possible in this case
    }
}

//what direction should the popup be in (prevents overflowing/going out of the page)
function positionPopup(target) {
    var frontDirection = "n" //n or s
    var sideDirection = "e" //w or e

    boundBox = target.getBoundingClientRect()
    popupSize = popupElement.getBoundingClientRect()
    resultingX = boundBox.left //boundBox.right - popupSize.width/2 + boundBox.width
    resultingY = window.innerHeight - boundBox.top

    if (resultingY < 0 || resultingY > window.innerHeight - popupSize.height) {
        popupElement.style["top"] = (boundBox.top + boundBox.height) + "px"
        popupElement.style["bottom"] = ""
        frontDirection = "s"
    } else {
        popupElement.style["top"] = ""
        popupElement.style["bottom"] = (resultingY) + "px"
        frontDirection = "n"
    }

    if (resultingX < 0 || resultingX > window.innerWidth - popupSize.width) {

        popupElement.style["left"] = ""
        popupElement.style["right"] = (window.innerWidth - boundBox.left - boundBox.width) + "px"
        sideDirection = "w"
    } else {
        popupElement.style["left"] = (resultingX) + "px"
        popupElement.style["right"] = ""
        sideDirection = "e"

    }
    resetResizable(frontDirection, sideDirection)
}

//sets where the user can resize the popup (if the popup is above the link and to the right, than north east (ne))
function resetResizable(frontDirection, sideDirection) {
    $("#HyperlinkPreview-Popup-ContentHelper").resizable({
        handles: `${frontDirection}, ${sideDirection}, ${frontDirection+sideDirection}`,
        resize: function (e, ui) {
            resizing = true
        }
    })
}

//refreshes the iframe and writes in new html
function resetIframe(htmlText) {
    popupElementContent.src = "about:blank";

    popupElementContent.contentWindow.document.open();
    try {
        popupElementContent.contentWindow.document.write(htmlText);
    } catch (e) {}
    popupElementContent.contentWindow.document.close();
}

//checks if the preview should be refresehed based on if the new url is different
function worthyPreview(targetURL) {
    var result = true
    var baseURL = targetURL.replace(/(#.*)/g, "")
    var documentURL = document.URL.replace(/(#.*)/g, "")
    result = !(baseURL == documentURL || baseURL == "")
    return result
}

function getBaseUrl(urlString) {
    const url = new URL(urlString)
    const baseUrl = `${url.hostname}`
    return baseUrl
}

//laucnhes the html request for the page
function launchRequest(elementLoopParent) {
    httpRequest = new XMLHttpRequest();
    $(popupElementContent).prop("src", elementLoopParent.href) //done to send correct headers to the page to ensure same-origin policies work properly
    httpRequest.open("GET", elementLoopParent.href) //used to get if the page can be loaded or not (provides the events needed to change states)
    try {
        httpRequest.send();
    } catch (error) {}

    httpRequest.addEventListener("load",
        function (data) {
            try {
                $(popupElementContent).on("load", function () {

                    changeState(PopupStates.Content)

                    //here we get rid of navbars/headers which might clunk up the inital view (still a work in progress)
                    $(popupElementContent).contents().find("header").css("display", "none")
                    $(popupElementContent).contents().find("body").css("margin-top", "0px")


                    positionPopup(elementLoopParent)
                })

            } catch (e) {}

        }
    )
    httpRequest.addEventListener("error", function (error) {
        try {
            changeState(PopupStates.Failed)
            positionPopup(elementLoopParent)
            httpRequest = new XMLHttpRequest();
        } catch (e) {}

    })

    httpRequest.addEventListener('timeout', function (err) {
        changeState(PopupStates.Failed)

    })

}

//sets if the iframe should allow scripts (risky? yes, but it is at the users discretion to trust websites)
function setIFrameScripting(scripReloading, reloadIframe = true) {
    if (scripReloading == true) {
        $(popupElementContent).prop("sandbox", "allow-same-origin allow-scripts")
    } else {
        $(popupElementContent).prop("sandbox", "allow-same-origin")
    }
    if (reloadIframe) {
        launchRequest(prev_target)
    }
}