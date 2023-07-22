$(document).ready(function () {
    chrome.storage.sync.get("authroizedLinks", ({
        authroizedLinks
    }) => {
        console.log(authroizedLinks)
        for(var element in authroizedLinks) {
            $("#list").append("<p>TEST</p>")
        }
    })
})