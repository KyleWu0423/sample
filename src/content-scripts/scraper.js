function startScraper() {
    console.log("Loading content script, everything is fine and dandy!");

    let previous_convo;
    let p; // parent with each chat row
    let id = "";
    let unified_id = false; // boolean to check if id matches ChatGPT ID

    // this chunk of code determines if the page is a previous chat or not and sets up the page accordingly
    let url = window.location.href;
    let url_split = url.split("/");
    if (url_split.length > 4) { // if the url has an id essentially.
        previous_convo = true;
        id = url_split[url_split.length - 1];
        console.log("previous convo detected!")
        unified_id = true;
    }

    p = document.querySelector("main > div > div > div > div")

    let page = []
    let first_time = false;
    if (!previous_convo) {
        first_time = true
    }
    document.body.appendChild(document.createElement(`div`)).setAttribute("id", "chat_history");
    let history_box = document.querySelector("#chat_history");

    //<polyline points="15 18 9 12 15 6">
    //<polyline points="9 18 15 12 9 6">
    /*
        The way that this new state works is by constantly updating and filling in the gaps.
        The length of an autosave should be short enough that in the time the user is flipping through the HTML,
            they should traverse ALL of the possible nodes without us having to add listeners.
     */
    let mirror_branch_state;
    mirror_branch_state = new TreeNode();

    function saveChildInnerHTML(parent, clone = true) { // generated by ChatGPT
        // Get the child elements of the parent
        let p1;
        if (clone) {
            p1 = parent.cloneNode(true)
            p1.setAttribute("style", "display: none;");
            history_box.innerHTML = "";
            history_box.appendChild(p1);
        } else {
            p1 = parent
        }
        var children = p1.children;

        // Create a string to store the innerHTML of each child
        var childInnerHTML = '';

        // Loop through each child element
        for (var i = 0; i < children.length; i++) {
            // Clone the child element
            var child = children[i];
            if (child.tagName == "PRE") {
                let div = child.firstChild.children[1]
                div.firstChild.classList.add('p-4')
                let text = div.innerHTML
                let clipboard = `<i class="fa-regular clipboard fa-clipboard"></i>`
                let copy_bar = `<div class="p-2 copy float-right">${clipboard} &nbsp; Copy code</div>`
                let template = `<pre>${copy_bar}<div>${text}</div></pre><br>`
                childInnerHTML += template;
            } else {
                // Remove the child's class attribute
                child.removeAttribute("class");

                // Recursively call the function on the child's children
                saveChildInnerHTML(child, false);

                // Add the child's innerHTML to the string
                childInnerHTML += child.outerHTML;
            }
        }

        return childInnerHTML;
    }

    function elementChildHasClass(element, className)
    {
        if(!element)
        {
            console.warn(`undefined element passed, returning undefined and doing nothing.`);
            return;
        }
        if(element.classList.contains(className)) return true;

        let children = element.children;
        for(let index = 0; index < children.length; index++)
        {
            if(elementChildHasClass(children[index], className)) return true;
        }
        return false;
    }

    function save_thread(human, h) {
        let text;
        if (human) {
            text = h.children[0].children[1].innerText // saves as plain text
            if(text.includes("Save & Submit\nCancel"))
            {
                // query the textarea instead
                text = h.querySelector("textarea")?.value;
            }
            text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        if (!human) {
            text = saveChildInnerHTML(h.firstChild.children[1].firstChild.firstChild.firstChild) // saves as html
            if (elementChildHasClass(h, 'text-red-500')){
                text = "ERROR"
            }
        }
        return text
    }

    function getDate() { // generated by ChatGPT
        var date = new Date();
        var options = {year: 'numeric', month: 'long', day: 'numeric'};
        return date.toLocaleString('default', options);
    }

    function getTime() { // generated by ChatGPT
        var currentDate = new Date();
        var options = {
            hour12: true,
            hour: "numeric",
            minute: "numeric"
        };
        var timeString = currentDate.toLocaleTimeString("default", options);
        return timeString
    }

    function generateUUID() {
        // create an array of possible characters for the UUID
        var possibleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        // create an empty string that will be used to generate the UUID
        var uuid = "";

        // loop over the possible characters and append a random character to the UUID string
        for (var i = 0; i < 36; i++) {
            uuid += possibleChars.charAt(Math.floor(Math.random() * possibleChars.length));
        }

        // return the generated UUID
        return uuid;
    }

    function getTitle(){
        let title = document.querySelector('title').innerText
        return title
    }

    function getObjectIndexByID(id, list) { // created by ChatGPT
        // Iterate over the list of objects
        for (let i = 0; i < list.length; i++) {
            const obj = list[i];

            // Check if the object has an `id` property that matches the given id
            if (obj.id && obj.id === id) {
                // If a match is found, return the object
                return i;
            }
        }

        // If no match is found, return null
        return null;
    }

    function save_page() {
        p = document.querySelector("main > div > div > div > div")
        let c = p.children
        if (c.length > 2) {
            let t;
            chrome.storage.local.get({threads: null}, function (result) {
                t = result.threads
                page = [];
                let current_leaf = mirror_branch_state;
                for (let i = 0; i < c.length - 1; i++) {
                    let human = i % 2 === 0;
                    let child = c[i];
                    let text = save_thread(human, child)

                    // don't save errors
                    if (text === "ERROR" || text.includes(`<p>network error</p>`) || text.includes(`<p>Load failed</p>`) || text.includes(`<p>Error in body stream/p>`)) {
                        text = t[getObjectIndexByID(id, t)].convo[i]
                        if (!text.endsWith(`(error)`)) {
                            text = `${text}<br> (error)`
                        }
                    }
                    page.push(text);
                    //console.log(page)

                    // mirror state;
					// get the children from the most specific div possible. It is always the LAST child of the profile pic container.
                    let elements = child.children[0].children[0].querySelectorAll("span");
                    // get last element because the first span in humans deals with profile pics
                    let spanText = elements[elements.length - 1]?.innerHTML; // html instead of text because it sometimes hides
                    if (human) {
                        // because there are now two spans being used for other stuff, but only for humans
                        if (elements.length < 3) spanText = undefined;
                    }

                    let leafIndex = 0;
					// remember that sometimes spanText is undefined, and that is normal because there isn't always a branch
                    if (spanText) {
                        let spanNumber = Number(spanText.split("/")[0]);
                        // sometimes spanText trawls up "!" that comes from content warning policy; just ignore that.
                        if (!isNaN(spanNumber)) {
                            // remember array indices start at 0
                            leafIndex = spanNumber - 1;
                            console.log(leafIndex);
                        }
                    }
                    current_leaf.setCurrentLeafIndex(leafIndex);
                    if (leafIndex > -1) {
                        let new_current_leaf = current_leaf.getCurrentLeaf();
                        if (!new_current_leaf) {
                            new_current_leaf = new TreeNode();
                            // array.set in case we don't start at the beginning.
                            // yes, that is a thing that happens
                            current_leaf.getLeaves()[leafIndex] = new_current_leaf;
                        }
                        new_current_leaf.setData(text);
                        current_leaf = new_current_leaf;
                    }
                }
                
                if (mirror_branch_state.toJSON() !== null) {
                    if (!previous_convo){
                        let conversation_id_el = document.querySelector('#conversationID');
                        if (conversation_id_el !== null) {
                            id = conversation_id_el.value;
                            unified_id = true;
                        } else {
                            if (id === "") {
                                id = generateUUID();
                            }
                        }
                    }
					
					if(unified_id)
					{
						if (t !== null) {
							if (first_time) {
								let thread = {
									date: getDate(),
									time: getTime(),
									convo: page,
									favorite: false,
									id: id,
									branch_state: mirror_branch_state.toJSON(),
									unified_id: unified_id,
								}
								first_time = false
								if (!previous_convo) {
									let title = getTitle()
									if (title !== "New chat"){
										thread.title = title
									}
								}
								t.push(thread)
							}
							else {
								let thread = {
									date: getDate(),
									time: getTime(),
									convo: page,
									favorite: false,
									id: id,
									branch_state: mirror_branch_state.toJSON(),
									unified_id: unified_id,
								}
								if (!previous_convo) {
									let title = getTitle()
									if (title !== "New chat"){
										thread.title = title
									}
								}
								let threadIndex = getObjectIndexByID(id, t);
								if(threadIndex !== null)
								{
									t[threadIndex] = thread;
								}
								else 
								{
									t.push(thread);
								}
							}
							chrome.storage.local.set({threads: t})
						}
						else { // very first conversation scraping
							let thread = {
								date: getDate(),
								time: getTime(),
								convo: page,
								favorite: false,
								id: id,
								branch_state: mirror_branch_state.toJSON(),
							}
							if (!previous_convo) {
								let title = getTitle()
								if (title !== "New chat"){
									thread.title = title
								}
							}
							let t = [thread]
							first_time = false
							chrome.storage.local.set({threads: t})
						}
					}
                }
            });
        }
    }
    let interval; let timer_started = false;

    document.addEventListener('keydown', function (event) { // generated by ChatGPT
        // Check if the pressed key was the Enter key
        if (event.key === 'Enter') {
            if (!timer_started) {
                interval = setInterval(save_page, 2000);
            }
            timer_started = true;
        }
    });

    let main = document.querySelector('main');

    //let stop_saving;
    const observer = new MutationObserver(function () { // created by chatGPT
        if (!timer_started) {
            interval = setInterval(save_page, 2000);
        }
        timer_started = true;
    });
    observer.observe(main, { // created by ChatGPT
        subtree: true,
        childList: true,
    });

    // this is also called the new chat button
    let reset = document.querySelector("nav").firstChild
    reset.addEventListener('click', function () {
        clearInterval(interval) // stop saving
        id = ""
        unified_id = false
        if (document.querySelector('#conversationID')){
            document.querySelector('#conversationID').remove()
        }
        if (document.querySelector('#history_box')){
            document.querySelector('#history_box').remove()
        }
        timer_started = false;
        first_time = true;
        mirror_branch_state = new TreeNode();
    })
}

let intro; let auto_send;
let disable = false;
let defaults = {buttons: true, auto_send: false, disable_history: false, auto_delete: false, message: "The following is a transcript of a conversation between me and ChatGPT. Use it for context in the rest of the conversation. Be ready to edit and build upon the responses previously given by ChatGPT. Respond \"ready!\" if you understand the context. Do not respond wit anything else. Conversation:\n"}
chrome.storage.local.get({settings: defaults}, function(result) {
    let settings = result.settings
    buttons = settings.buttons
    intro = settings.message
    auto_send = settings.auto_send
    if (settings.hasOwnProperty('disable_history') && settings.disable_history === true){
        disable = true;
        console.log("SCRAPER DISABLED!")
    }
    console.log(disable)
    start()
})

function start(){
    if (disable === false) {
        startScraper()
        let scraper_url = window.location.href;

        function check_url() {
            if (scraper_url !== window.location.href) {
                scraper_url = window.location.href;
                first_time = false
                startScraper()
                id = ""
                if (document.querySelector('#conversationID')){
                    document.querySelector('#conversationID').remove()
                }
                if (document.querySelector('#history_box')){
                    document.querySelector('#history_box').remove()
                }
                timer_started = false;
                mirror_branch_state = new TreeNode();
                console.log("URL CHANGE")
            }
        }
        setInterval(check_url, 500);
    }
}

function continue_convo(convo){
    const input = document.querySelector("textarea");
    input.style.height = "200px";
    const button = input.parentElement.querySelector("button");
    input.value = `${intro} ${convo}`;
    if (auto_send) {
        button.click();
    }
}

function use_prompt(prompt){
    const input = document.querySelector("textarea");
    input.style.height = "200px";
    const button = input.parentElement.querySelector("button");
    input.value = `${prompt}`;
    if (auto_send) {
        button.click();
    }
}

// listen for messages
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(request)
        if (request.type === "c_continue_convo") {
            console.log("message recieved!")
            continue_convo(JSON.stringify(request.convo))
        }
        else if(request.type === "c_use_prompt") {
            console.log("message recieved!");
            use_prompt(request.prompt);
        }
    }
);