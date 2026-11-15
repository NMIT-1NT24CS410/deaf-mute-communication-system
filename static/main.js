
document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // SPEECH SYNTHESIS
    // =========================================================

    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();

        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }

    // =========================================================
    // TRANSLATION DICTIONARY
    // =========================================================

    const TRANSLATIONS = {
        en_to_kn: {
            "HELLO": "ನಮಸ್ಕಾರ",
            "THANK_YOU": "ಧನ್ಯವಾದಗಳು",
            "YES": "ಹೌದು",
            "NO": "ಇಲ್ಲ",
            "PLEASE": "ದಯವಿಟ್ಟು",
            "HELP": "ಸಹಾಯ",
            "GOODBYE": "ಹೋಗಿ ಬರುತ್ತೇನೆ",
            "SORRY": "ಕ್ಷಮಿಸಿ",
            "WELCOME": "ಸ್ವಾಗತ",
            "MORE": "ಇನ್ನಷ್ಟು",
            "EAT": "ತಿನ್ನು",
            "DRINK": "ಕುಡಿ",
            "FATHER": "ತಂದೆ",
            "MOTHER": "ತಾಯಿ",
            "FRIEND": "ಸ್ನೇಹಿತ",
            "HAPPY": "ಸಂತೋಷ",
            "SAD": "ದುಃಖ",
            "?": "?"
        },

        kn_to_en: {
            "ನಮಸ್ಕಾರ": "HELLO",
            "ಧನ್ಯವಾದಗಳು": "THANK_YOU",
            "ಹೌದು": "YES",
            "ಇಲ್ಲ": "NO",
            "ದಯವಿಟ್ಟು": "PLEASE",
            "ಸಹಾಯ": "HELP",
            "ಹೋಗಿ ಬರುತ್ತೇನೆ": "GOODBYE",
            "ಕ್ಷಮಿಸಿ": "SORRY",
            "ಸ್ವಾಗತ": "WELCOME",
            "ಇನ್ನಷ್ಟು": "MORE",
            "ತಿನ್ನು": "EAT",
            "ಕುಡಿ": "DRINK",
            "ತಂದೆ": "FATHER",
            "ತಾಯಿ": "MOTHER",
            "ಸ್ನೇಹಿತ": "FRIEND",
            "ಸಂತೋಷ": "HAPPY",
            "ದುಃಖ": "SAD"
        }
    };

    let lastEnglishWord = "";
    let cachedKannadaWord = "";
    let lastEnglishPred = "";
    let cachedKannadaPred = "";

    async function translateText(text, targetLang) {
        if (!text || text === "?") return text;

        const cleanText = text.trim();

        if (targetLang === 'kn') {
            const key = cleanText.toUpperCase().replace(/ /g, '_');

            if (TRANSLATIONS.en_to_kn[key]) {
                return TRANSLATIONS.en_to_kn[key];
            }

            if (cleanText.length === 1 && /[A-Z0-9]/i.test(cleanText)) {
                return cleanText;
            }

            try {
                const url =
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=kn&dt=t&q=${encodeURIComponent(cleanText)}`;

                const res = await fetch(url);
                const data = await res.json();

                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    return data[0][0][0];
                }

            } catch (e) {
                console.warn("Translation API error:", e);
            }

            return cleanText;

        } else {
            if (TRANSLATIONS.kn_to_en[cleanText]) {
                return TRANSLATIONS.kn_to_en[cleanText];
            }

            const words = cleanText.split(/\s+/);
            const translatedWords = [];

            let allFound = true;

            for (const w of words) {
                if (TRANSLATIONS.kn_to_en[w]) {
                    translatedWords.push(TRANSLATIONS.kn_to_en[w]);
                } else {
                    allFound = false;
                    break;
                }
            }

            if (allFound) {
                return translatedWords.join(" ");
            }

            try {
                const url =
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=kn&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;

                const res = await fetch(url);
                const data = await res.json();

                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    return data[0][0][0];
                }

            } catch (e) {
                console.warn("Translation API error:", e);
            }

            return cleanText;
        }
    }

    async function getTranslatedState(englishWord, englishPred) {
        let wordTrans = englishWord;
        let predTrans = englishPred;

        const langSelect = document.getElementById('lang-select');
        const selectedLang = langSelect ? langSelect.value : 'en';

        if (selectedLang === 'kn') {

            if (englishPred !== lastEnglishPred) {
                lastEnglishPred = englishPred;
                cachedKannadaPred = await translateText(englishPred, 'kn');
            }

            predTrans = cachedKannadaPred;

            if (englishWord !== lastEnglishWord) {
                lastEnglishWord = englishWord;
                cachedKannadaWord = await translateText(englishWord, 'kn');
            }

            wordTrans = cachedKannadaWord;

        } else {
            wordTrans = englishWord;
            predTrans = englishPred;
        }

        return { wordTrans, predTrans };
    }

    // =========================================================
    // NAVIGATION
    // =========================================================

    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.module-section');

    const videoStream = document.getElementById('video-stream');

    // =========================================================
    // MODULE 1: LAPTOP WEBCAM
    // =========================================================

    let module1CameraStream = null;
    let module1PredictionTimer = null;
    let module1FrameBusy = false;

    const module1Canvas = document.createElement('canvas');
    const module1Context = module1Canvas.getContext('2d');

    async function startModule1Camera() {

        if (!videoStream) {
            console.error("Module 1 video element not found.");
            return;
        }

        if (module1CameraStream) {
            return;
        }

        try {

            if (!navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia) {

                throw new Error(
                    "Camera API unavailable. Please use HTTPS."
                );
            }

            console.log("[Module 1] Requesting laptop camera...");

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });

            // User may have navigated away while permission was pending.
            if (!document.getElementById('module1').classList.contains('active')) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            module1CameraStream = stream;
            videoStream.srcObject = stream;

            await videoStream.play();

            console.log("[Module 1] Laptop camera started.");

            if (module1PredictionTimer) {
                clearInterval(module1PredictionTimer);
            }

            module1PredictionTimer = setInterval(
                sendModule1Frame,
                500
            );

        } catch (error) {

            console.error("[Module 1] Camera error:", error);

            alert(
                "Unable to start camera: " + error.message
            );
        }
    }

    async function sendModule1Frame() {

        if (
            module1FrameBusy ||
            !module1CameraStream ||
            !videoStream ||
            videoStream.readyState < 2 ||
            videoStream.videoWidth === 0
        ) {
            return;
        }

        module1FrameBusy = true;

        try {

            const width = 320;

            const height = Math.round(
                videoStream.videoHeight *
                (width / videoStream.videoWidth)
            );

            module1Canvas.width = width;
            module1Canvas.height = height;

            module1Context.drawImage(
                videoStream,
                0,
                0,
                width,
                height
            );

            const imageData = module1Canvas.toDataURL(
                'image/jpeg',
                0.75
            );

            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: imageData
                })
            });

            if (!response.ok) {
                throw new Error(
                    `Prediction API error: HTTP ${response.status}`
                );
            }

            const result = await response.json();

            if (result.error) {
                console.warn("[Module 1] Prediction:", result.error);
            }

            const prediction = result.prediction || "?";
            const confidence = Number(result.confidence || 0);

            const currentPredEl =
                document.getElementById('current-pred');

            const predConfEl =
                document.getElementById('pred-conf');

            if (currentPredEl) {
                currentPredEl.textContent = prediction;
            }

            if (predConfEl) {
                predConfEl.textContent =
                    (confidence * 100).toFixed(1);
            }

        } catch (error) {

            console.error(
                "[Module 1] Frame prediction error:",
                error
            );

        } finally {
            module1FrameBusy = false;
        }
    }

    function stopModule1Camera() {

        if (module1PredictionTimer) {
            clearInterval(module1PredictionTimer);
            module1PredictionTimer = null;
        }

        if (module1CameraStream) {

            module1CameraStream.getTracks().forEach(track => {
                track.stop();
            });

            module1CameraStream = null;
        }

        if (videoStream) {
            videoStream.pause();
            videoStream.srcObject = null;
        }

        module1FrameBusy = false;

        console.log("[Module 1] Laptop camera stopped.");
    }

    // =========================================================
    // MODULE 1: NAVIGATION EVENTS
    // =========================================================

    navLinks.forEach(link => {

        link.addEventListener('click', () => {

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('data-target');

            sections.forEach(sec => sec.classList.remove('active'));

            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                targetSection.classList.add('active');
            }

            if (targetId === 'module1') {
                startModule1Camera();
                startPollingState();
            } else {
                stopModule1Camera();
                stopPollingState();
            }

            if (targetId !== 'module3') {
                if (typeof leaveCall === 'function') {
                    leaveCall();
                }
            }
        });
    });

    // =========================================================
    // MODULE 1: SIGN TO SPEECH
    // =========================================================

    let pollingInterval = null;

    const currentPredEl = document.getElementById('current-pred');
    const predConfEl = document.getElementById('pred-conf');
    const currentWordEl = document.getElementById('current-word');

    function startPollingState() {

        if (!pollingInterval) {
            pollingInterval = setInterval(fetchState, 500);
        }
    }

    function stopPollingState() {

        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    async function fetchState() {

        try {

            const res = await fetch('/state');
            const data = await res.json();

            const selectedLang =
                document.getElementById('lang-select')?.value || 'en';

            const { wordTrans, predTrans } =
                await getTranslatedState(
                    data.current_word || '',
                    data.current_prediction || '?'
                );

            if (currentPredEl) {

                if (
                    selectedLang === 'kn' &&
                    data.current_prediction !== '?'
                ) {
                    currentPredEl.textContent =
                        `${data.current_prediction} (${predTrans})`;
                } else {
                    currentPredEl.textContent =
                        data.current_prediction || '?';
                }
            }

            if (predConfEl) {
                predConfEl.textContent =
                    Math.round(Number(data.confidence || 0) * 100);
            }

            if (currentWordEl) {
                currentWordEl.textContent = wordTrans || '';
            }

        } catch (e) {
            console.error("Error fetching state:", e);
        }
    }

    async function sendAction(action) {

        try {

            const res = await fetch('/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action })
            });

            const data = await res.json();

            if (action === 'speak' && data.word) {

                const selectedLang =
                    document.getElementById('lang-select').value;

                if (selectedLang === 'kn') {

                    const translatedWord =
                        await translateText(data.word, 'kn');

                    speakText(translatedWord, 'kn-IN');

                } else {
                    speakText(data.word, 'en-US');
                }
            }

            fetchState();

        } catch (e) {
            console.error("Action error:", e);
        }
    }

    const langSelect = document.getElementById('lang-select');

    if (langSelect) {

        langSelect.addEventListener('change', () => {

            lastEnglishWord = "";
            cachedKannadaWord = "";
            lastEnglishPred = "";
            cachedKannadaPred = "";

            fetchState();
        });
    }

    document.getElementById('btn-add')?.addEventListener(
        'click',
        () => sendAction('add')
    );

    document.getElementById('btn-speak')?.addEventListener(
        'click',
        () => sendAction('speak')
    );

    document.getElementById('btn-back')?.addEventListener(
        'click',
        () => sendAction('backspace')
    );

    document.getElementById('btn-clear')?.addEventListener(
        'click',
        () => sendAction('clear')
    );

    // Module 1 keyboard shortcuts

    document.addEventListener('keydown', (e) => {

        if (!document.getElementById('module1')?.classList.contains('active')) {
            return;
        }

        if (
            ['Space', 'Enter', 'Backspace', 'c', 'C'].includes(e.key) ||
            e.code === 'Space'
        ) {
            e.preventDefault();
        }

        if (e.code === 'Space') {
            sendAction('add');
        } else if (e.code === 'Enter') {
            sendAction('speak');
        } else if (e.code === 'Backspace') {
            sendAction('backspace');
        } else if ((e.key || '').toLowerCase() === 'c') {
            sendAction('clear');
        }
    });

    // =========================================================
    // SPEECH OUTPUT
    // =========================================================

    function speakText(text, lang = 'en-US') {

        if (!text || !window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.rate = 0.9;
        utterance.lang = lang;

        const voices = window.speechSynthesis.getVoices();

        const voice = voices.find(v =>
            v.lang.startsWith(lang)
        );

        if (voice) {
            utterance.voice = voice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // =========================================================
    // MODULE 2: TEXT / SPEECH TO SIGN
    // =========================================================

    const textInput = document.getElementById('text-input');
    const btnTranslate = document.getElementById('btn-translate');
    const btnMic = document.getElementById('btn-mic');

    const slideshowArea = document.getElementById('slideshow-area');
    const playingWordEl = document.getElementById('playing-word');
    const signImgEl = document.getElementById('current-sign-img');
    const placeholderEl = document.getElementById('no-image-placeholder');
    const placeholderCharEl = document.getElementById('no-image-char');
    const progressBar = document.getElementById('sign-progress');
    const slideCounter = document.getElementById('slide-counter');

    let isSlideshowRunning = false;

    // Speech recognition

    let recognition;

    if ('webkitSpeechRecognition' in window ||
        'SpeechRecognition' in window) {

        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = function () {
            btnMic?.classList.add('recording');
        };

        recognition.onresult = function (event) {

            const transcript = event.results[0][0].transcript;

            if (textInput) {
                textInput.value = transcript;
            }
        };

        recognition.onerror = function (event) {

            console.error("Speech recognition error:", event.error);

            btnMic?.classList.remove('recording');

            alert("Could not recognize speech. Please try again.");
        };

        recognition.onend = function () {

            btnMic?.classList.remove('recording');

            if (textInput?.value.trim()) {
                startTranslation();
            }
        };

        btnMic?.addEventListener('click', () => {

            if (btnMic.classList.contains('recording')) {
                recognition.stop();
            } else {

                textInput.value = '';

                const selectedLang =
                    document.getElementById('lang-select').value;

                recognition.lang =
                    selectedLang === 'kn' ? 'kn-IN' : 'en-US';

                recognition.start();
            }
        });

    } else if (btnMic) {
        btnMic.style.display = 'none';
    }

    btnTranslate?.addEventListener('click', startTranslation);

    textInput?.addEventListener('keydown', (e) => {

        if (e.key === 'Enter') {
            startTranslation();
        }
    });

    const btnTextToSpeech =
        document.getElementById('btn-text-to-speech');

    btnTextToSpeech?.addEventListener('click', () => {

        const text = textInput?.value.trim();

        if (text) {

            const selectedLang =
                document.getElementById('lang-select').value;

            speakText(
                text,
                selectedLang === 'kn' ? 'kn-IN' : 'en-US'
            );
        }
    });

    async function startTranslation() {

        const text = textInput?.value.trim();

        if (!text || isSlideshowRunning) return;

        const selectedLang =
            document.getElementById('lang-select').value;

        let queryText = text;

        if (selectedLang === 'kn') {

            queryText = await translateText(text, 'en');

            console.log(
                `Translated Kannada "${text}" to English "${queryText}"`
            );
        }

        try {

            const res = await fetch('/text_to_sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: queryText })
            });

            const data = await res.json();

            if (data.steps && data.steps.length > 0) {

                runSlideshow(data.steps, text);

            } else {

                alert(
                    "No alphanumeric characters or words found to translate."
                );
            }

        } catch (e) {
            console.error("Translation error:", e);
        }
    }

    function preloadFrames(frameUrls) {

        return Promise.all(
            frameUrls.map(url => {

                return new Promise(resolve => {

                    const img = new Image();

                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);

                    img.src = url;
                });
            })
        );
    }

    async function runSlideshow(steps, originalText) {

        isSlideshowRunning = true;

        slideshowArea.style.display = 'flex';
        playingWordEl.textContent = originalText;

        try {

            for (let i = 0; i < steps.length; i++) {

                const step = steps[i];

                slideCounter.textContent =
                    `${i + 1} / ${steps.length}`;

                progressBar.style.width =
                    `${((i + 1) / steps.length) * 100}%`;

                if (step.frames.length > 1) {

                    await preloadFrames(step.frames);

                    const animationFrameDelay = 120;

                    for (let f = 0; f < step.frames.length; f++) {

                        signImgEl.src = step.frames[f];

                        signImgEl.style.display = 'block';
                        placeholderEl.style.display = 'none';

                        await new Promise(resolve =>
                            setTimeout(resolve, animationFrameDelay)
                        );
                    }

                    await new Promise(resolve =>
                        setTimeout(resolve, 300)
                    );

                } else {

                    await displaySign(
                        step.frames[0],
                        step.label
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, 1200)
                    );
                }
            }

        } catch (e) {
            console.error("Slideshow error:", e);

        } finally {

            isSlideshowRunning = false;

            setTimeout(() => {

                slideshowArea.style.display = 'none';

                if (textInput) {
                    textInput.value = '';
                }

            }, 1000);
        }
    }

    function displaySign(url, label) {

        return new Promise(resolve => {

            const img = new Image();

            img.onload = () => {

                signImgEl.src = url;

                signImgEl.style.display = 'block';
                placeholderEl.style.display = 'none';

                resolve();
            };

            img.onerror = () => {

                signImgEl.style.display = 'none';
                placeholderEl.style.display = 'flex';

                placeholderCharEl.textContent = label;

                placeholderCharEl.style.fontSize =
                    label.length > 1 ? '2rem' : '';

                resolve();
            };

            img.src = url;
        });
    }

    // =========================================================
    // MODULE 3: VIDEO CALL
    // =========================================================

    let socket = null;
    let localStream = null;
    let remoteStream = null;
    let peerConnection = null;
    let roomCode = "";

    let isTrackingActive = true;
    let predictTimer = null;

    let callCurrentWord = "";
    let callLastPrediction = "?";
    let callStableFrames = 0;
    let lastSentSign = "";

    let isProcessingFrame = false;

    let userName = "User";
    let peerName = "Peer";

    const peerConfiguration = {
        iceServers: [
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]
            }
        ]
    };

    const callRoomInput =
        document.getElementById('call-room-input');

    const btnJoinCall =
        document.getElementById('btn-join-call');

    const btnLeaveCall =
        document.getElementById('btn-leave-call');

    const callStatusEl =
        document.getElementById('call-status');

    const videoCallSetup =
        document.getElementById('video-call-setup');

    const videoCallActive =
        document.getElementById('video-call-active');

    const localVideo =
        document.getElementById('local-video');

    const remoteVideo =
        document.getElementById('remote-video');

    const callChatInput =
        document.getElementById('call-chat-input');

    const btnCallMic =
        document.getElementById('btn-call-mic');

    // Mini slideshow elements

    const miniSlideshow =
        document.getElementById('mini-slideshow');

    const miniPlayingWord =
        document.getElementById('mini-playing-word');

    const miniSignImg =
        document.getElementById('mini-sign-img');

    const miniPlaceholder =
        document.getElementById('mini-no-image-placeholder');

    const miniPlaceholderChar =
        document.getElementById('mini-no-image-char');

    let isMiniSlideshowRunning = false;

    // =========================================================
    // MODULE 3: CHAT LOGS
    // =========================================================

    function appendCallLog(sender, text, type) {

        const chatLogs =
            document.getElementById('call-chat-logs');

        if (!chatLogs) return;

        const placeholder =
            chatLogs.querySelector('.system-message');

        if (placeholder) {
            placeholder.remove();
        }

        const msgDiv = document.createElement('div');

        msgDiv.className = 'chat-log-msg';

        msgDiv.style.padding = '8px 12px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.fontSize = '0.95rem';
        msgDiv.style.lineHeight = '1.4';
        msgDiv.style.maxWidth = '80%';
        msgDiv.style.display = 'inline-block';
        msgDiv.style.width = 'fit-content';

        const strong = document.createElement('strong');

        if (sender === 'You') {

            msgDiv.style.alignSelf = 'flex-end';

            if (type === 'sign') {
                msgDiv.style.background = 'rgba(74, 222, 128, 0.15)';
                msgDiv.style.border = '1px solid rgba(74, 222, 128, 0.4)';
                strong.textContent = 'You (Sign): ';
            } else {
                msgDiv.style.background = 'rgba(59, 130, 246, 0.15)';
                msgDiv.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                strong.textContent = 'You (Text): ';
            }

        } else {

            msgDiv.style.alignSelf = 'flex-start';

            if (type === 'sign') {
                msgDiv.style.background = 'rgba(251, 191, 36, 0.15)';
                msgDiv.style.border = '1px solid rgba(251, 191, 36, 0.4)';
                strong.textContent = 'Peer (Sign): ';
            } else {
                msgDiv.style.background = 'rgba(167, 139, 250, 0.15)';
                msgDiv.style.border = '1px solid rgba(167, 139, 250, 0.4)';
                strong.textContent = 'Peer (Text): ';
            }
        }

        msgDiv.appendChild(strong);
        msgDiv.appendChild(document.createTextNode(text));

        chatLogs.appendChild(msgDiv);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    }

    // =========================================================
    // MODULE 3: JOIN CALL
    // =========================================================

    btnJoinCall?.addEventListener('click', async () => {

        roomCode = callRoomInput.value.trim();

        const nameInput =
            document.getElementById('call-name-input');

        userName = nameInput ? nameInput.value.trim() : "";

        if (!userName) {
            userName = "User";
        }

        if (!roomCode) {
            alert("Please enter a Room ID.");
            return;
        }

        socket = io(window.location.origin);

        const chatLogs =
            document.getElementById('call-chat-logs');

        if (chatLogs) {
            chatLogs.innerHTML =
                `<div class="system-message" style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem; text-align: center;">Connecting to room...</div>`;
        }

        try {

            localStream =
                await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });

            localVideo.srcObject = localStream;

            videoCallSetup.style.display = 'none';
            videoCallActive.style.display = 'block';

            callStatusEl.innerHTML =
                `<i class="fa-solid fa-circle-check"></i> Connected to Room: ${roomCode}`;

            socket.emit('join', {
                room: roomCode,
                name: userName
            });

            startCallPrediction();

            initializePeerConnection();

        } catch (e) {

            console.error("Camera access failed:", e);

            alert(
                "Failed to access camera/microphone. Ensure HTTPS permission is granted."
            );

            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }
    });

    // =========================================================
    // MODULE 3: WEBRTC
    // =========================================================

    function initializePeerConnection() {

        peerConnection = new RTCPeerConnection(peerConfiguration);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {

            if (!remoteStream) {

                remoteStream = new MediaStream();

                remoteVideo.srcObject = remoteStream;
            }

            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };

        peerConnection.onicecandidate = (event) => {

            if (event.candidate) {

                socket.emit('signal', {
                    room: roomCode,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        socket.on('peer-joined', async (data) => {

            peerName = data.name || "Peer";

            console.log(
                "[WebRTC] Peer joined:",
                peerName
            );

            const remoteHeader =
                document.querySelector(
                    '.video-card:nth-child(2) .video-card-header h3'
                );

            if (remoteHeader) {
                remoteHeader.innerHTML =
                    `<i class="fa-solid fa-user-group"></i> Remote Feed (${peerName})`;
            }

            const chatLogs =
                document.getElementById('call-chat-logs');

            if (chatLogs) {

                const sysMsg = document.createElement('div');

                sysMsg.className = 'system-message';
                sysMsg.style.color = '#10b981';
                sysMsg.style.fontStyle = 'italic';
                sysMsg.style.fontSize = '0.9rem';
                sysMsg.style.textAlign = 'center';

                sysMsg.textContent =
                    `${peerName} joined the call.`;

                chatLogs.appendChild(sysMsg);
            }

            socket.emit('signal', {
                room: roomCode,
                type: 'name-intro',
                name: userName
            });

            try {

                const offer =
                    await peerConnection.createOffer();

                await peerConnection.setLocalDescription(offer);

                socket.emit('signal', {
                    room: roomCode,
                    type: 'offer',
                    sdp: offer
                });

            } catch (e) {
                console.error("Failed to create offer:", e);
            }
        });

        socket.on('signal', async (data) => {

            try {

                if (data.type === 'name-intro') {

                    peerName = data.name || "Peer";

                    const remoteHeader =
                        document.querySelector(
                            '.video-card:nth-child(2) .video-card-header h3'
                        );

                    if (remoteHeader) {
                        remoteHeader.innerHTML =
                            `<i class="fa-solid fa-user-group"></i> Remote Feed (${peerName})`;
                    }

                    return;
                }

                if (data.type === 'offer') {

                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(data.sdp)
                    );

                    const answer =
                        await peerConnection.createAnswer();

                    await peerConnection.setLocalDescription(answer);

                    socket.emit('signal', {
                        room: roomCode,
                        type: 'answer',
                        sdp: answer
                    });

                } else if (data.type === 'answer') {

                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(data.sdp)
                    );

                } else if (data.type === 'candidate') {

                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(data.candidate)
                    );
                }

            } catch (e) {
                console.error("[WebRTC] Signaling error:", e);
            }
        });

        socket.on('chat-message', (data) => {
            handleIncomingMessage(data);
        });
    }

    // =========================================================
    // MODULE 3: SIGN PREDICTION
    // =========================================================

    function startCallPrediction() {

        if (predictTimer) {
            clearInterval(predictTimer);
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        predictTimer = setInterval(async () => {

            if (isProcessingFrame) return;
            if (!isTrackingActive || !localStream) return;
            if (!localVideo || localVideo.videoWidth === 0) return;

            isProcessingFrame = true;

            try {

                const maxDim = 320;

                let w = localVideo.videoWidth;
                let h = localVideo.videoHeight;

                if (w > maxDim) {
                    h = Math.round(h * (maxDim / w));
                    w = maxDim;
                }

                canvas.width = w;
                canvas.height = h;

                context.drawImage(
                    localVideo,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                const dataUrl =
                    canvas.toDataURL('image/jpeg', 0.85);

                if (!socket || !socket.connected) {

                    const res = await fetch('/predict', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            image: dataUrl
                        })
                    });

                    const data = await res.json();

                    handlePredictionResult(data);

                } else {

                    socket.emit(
                        'predict-frame',
                        { image: dataUrl },
                        (data) => {
                            handlePredictionResult(data);
                        }
                    );
                }

            } catch (e) {

                console.error(
                    "Call prediction error:",
                    e
                );

            } finally {
                isProcessingFrame = false;
            }

        }, 150);
    }

    function handlePredictionResult(data) {

        if (!data) return;

        const pred = data.prediction || "?";

        const conf = Math.round(
            (data.confidence || 0) * 100
        );

        const localPred =
            document.getElementById('call-local-pred');

        const localConf =
            document.getElementById('call-local-conf');

        if (localPred) {
            localPred.textContent = pred;
        }

        if (localConf) {
            localConf.textContent = conf;
        }

        if (pred !== "?") {

            if (pred === callLastPrediction) {

                callStableFrames++;

                if (callStableFrames === 5) {

                    if (pred.length > 1) {

                        if (
                            callCurrentWord &&
                            !callCurrentWord.endsWith(" ")
                        ) {
                            callCurrentWord += " ";
                        }

                        callCurrentWord += pred + " ";

                    } else {
                        callCurrentWord += pred;
                    }

                    const wordBox =
                        document.getElementById('call-word-box');

                    if (wordBox) {
                        wordBox.textContent = callCurrentWord;
                    }

                    if (pred !== lastSentSign) {

                        sendCallMessage(pred, 'sign_to_text');

                        appendCallLog('You', pred, 'sign');

                        lastSentSign = pred;
                    }

                    callStableFrames = 0;
                }

            } else {

                callStableFrames = 0;
                callLastPrediction = pred;
            }

        } else {

            callStableFrames = 0;
            callLastPrediction = "?";
            lastSentSign = "";
        }
    }

    function sendCallMessage(text, type) {

        if (!socket || !roomCode) return;

        socket.emit('chat-message', {
            room: roomCode,
            text: text,
            type: type
        });
    }

    // =========================================================
    // MODULE 3: INCOMING MESSAGES
    // =========================================================

    async function handleIncomingMessage(data) {

        const { text, type } = data;

        if (type === 'sign_to_text') {

            appendCallLog('Peer', text, 'sign');

            const remoteCaptions =
                document.getElementById('remote-captions');

            if (remoteCaptions) {

                remoteCaptions.textContent = text;
                remoteCaptions.classList.add('active-caption');

                setTimeout(() => {

                    if (remoteCaptions.textContent === text) {

                        remoteCaptions.textContent =
                            "Waiting for peer signs...";

                        remoteCaptions.classList.remove(
                            'active-caption'
                        );
                    }

                }, 6000);
            }

            const chkAutoSpeak =
                document.getElementById('chk-auto-speak');

            if (chkAutoSpeak && chkAutoSpeak.checked) {

                const selectedLang =
                    document.getElementById('lang-select').value;

                if (selectedLang === 'kn') {

                    const translated =
                        await translateText(text, 'kn');

                    speakText(translated, 'kn-IN');

                } else {
                    speakText(text, 'en-US');
                }
            }

        } else if (type === 'text_to_sign') {

            appendCallLog('Peer', text, 'text');

            const chkAutoSign =
                document.getElementById('chk-auto-sign');

            if (chkAutoSign && chkAutoSign.checked) {
                playMiniSlideshow(text);
            }
        }
    }

    // =========================================================
    // MODULE 3: MINI SLIDESHOW
    // =========================================================

    async function playMiniSlideshow(text) {

        if (isMiniSlideshowRunning || !miniSlideshow) return;

        isMiniSlideshowRunning = true;

        miniSlideshow.style.display = 'flex';

        if (miniPlayingWord) {
            miniPlayingWord.textContent = text;
        }

        try {

            const selectedLang =
                document.getElementById('lang-select').value;

            let queryText = text;

            if (selectedLang === 'kn') {
                queryText = await translateText(text, 'en');
            }

            const res = await fetch('/text_to_sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: queryText
                })
            });

            const data = await res.json();

            if (data.steps && data.steps.length > 0) {

                for (let i = 0; i < data.steps.length; i++) {

                    const step = data.steps[i];

                    if (step.frames.length > 1) {

                        await preloadFrames(step.frames);

                        for (let f = 0; f < step.frames.length; f++) {

                            if (miniSignImg) {
                                miniSignImg.src = step.frames[f];
                                miniSignImg.style.display = 'block';
                            }

                            if (miniPlaceholder) {
                                miniPlaceholder.style.display = 'none';
                            }

                            await new Promise(resolve =>
                                setTimeout(resolve, 120)
                            );
                        }

                        await new Promise(resolve =>
                            setTimeout(resolve, 300)
                        );

                    } else {

                        await displayMiniSign(
                            step.frames[0],
                            step.label
                        );

                        await new Promise(resolve =>
                            setTimeout(resolve, 1200)
                        );
                    }
                }
            }

        } catch (e) {

            console.error("Mini slideshow error:", e);

        } finally {

            isMiniSlideshowRunning = false;

            setTimeout(() => {
                miniSlideshow.style.display = 'none';
            }, 1000);
        }
    }

    function displayMiniSign(url, label) {

        return new Promise(resolve => {

            const img = new Image();

            img.onload = () => {

                if (miniSignImg) {
                    miniSignImg.src = url;
                    miniSignImg.style.display = 'block';
                }

                if (miniPlaceholder) {
                    miniPlaceholder.style.display = 'none';
                }

                resolve();
            };

            img.onerror = () => {

                if (miniSignImg) {
                    miniSignImg.style.display = 'none';
                }

                if (miniPlaceholder) {
                    miniPlaceholder.style.display = 'flex';
                }

                if (miniPlaceholderChar) {
                    miniPlaceholderChar.textContent = label;
                }

                resolve();
            };

            img.src = url;
        });
    }

    // =========================================================
    // MODULE 3: LEAVE CALL
    // =========================================================

    function leaveCall() {

        if (predictTimer) {
            clearInterval(predictTimer);
            predictTimer = null;
        }

        if (localStream) {

            localStream.getTracks().forEach(track => {
                track.stop();
            });

            localStream = null;
        }

        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        if (socket) {
            socket.disconnect();
            socket = null;
        }

        if (localVideo) {
            localVideo.srcObject = null;
        }

        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }

        remoteStream = null;
        peerName = "Peer";

        const remoteHeader =
            document.querySelector(
                '.video-card:nth-child(2) .video-card-header h3'
            );

        if (remoteHeader) {
            remoteHeader.innerHTML =
                `<i class="fa-solid fa-user-group"></i> Remote Feed (Peer)`;
        }

        const chatLogs =
            document.getElementById('call-chat-logs');

        if (chatLogs) {
            chatLogs.innerHTML =
                `<div class="system-message" style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem; text-align: center;">Waiting for call participants...</div>`;
        }

        callCurrentWord = "";
        lastSentSign = "";
        callLastPrediction = "?";
        callStableFrames = 0;
        isProcessingFrame = false;

        const box =
            document.getElementById('call-word-box');

        if (box) box.textContent = "";

        const localPred =
            document.getElementById('call-local-pred');

        if (localPred) localPred.textContent = "?";

        const localConf =
            document.getElementById('call-local-conf');

        if (localConf) localConf.textContent = "0";

        if (videoCallActive) {
            videoCallActive.style.display = 'none';
        }

        if (videoCallSetup) {
            videoCallSetup.style.display = 'block';
        }

        if (callStatusEl) {
            callStatusEl.innerHTML =
                `<i class="fa-solid fa-circle-info"></i> Status: Disconnected`;
        }
    }

    // =========================================================
    // MODULE 3: BUTTONS
    // =========================================================

    document.getElementById('btn-call-add')?.addEventListener(
        'click',
        () => {

            const pred =
                document.getElementById('call-local-pred')?.textContent;

            if (pred && pred !== "?") {

                if (pred.length > 1) {

                    if (
                        callCurrentWord &&
                        !callCurrentWord.endsWith(" ")
                    ) {
                        callCurrentWord += " ";
                    }

                    callCurrentWord += pred + " ";

                } else {
                    callCurrentWord += pred;
                }

                const wordBox =
                    document.getElementById('call-word-box');

                if (wordBox) {
                    wordBox.textContent = callCurrentWord;
                }
            }
        }
    );

    document.getElementById('btn-call-back')?.addEventListener(
        'click',
        () => {

            if (callCurrentWord.length > 0) {

                callCurrentWord =
                    callCurrentWord.slice(0, -1);

                document.getElementById('call-word-box').textContent =
                    callCurrentWord;
            }
        }
    );

    document.getElementById('btn-call-clear')?.addEventListener(
        'click',
        () => {

            callCurrentWord = "";

            document.getElementById('call-word-box').textContent = "";
        }
    );

    document.getElementById('btn-call-send-word')?.addEventListener(
        'click',
        () => {

            if (callCurrentWord.trim() !== "") {

                const word = callCurrentWord.trim();

                sendCallMessage(word, 'sign_to_text');

                appendCallLog('You', word, 'sign');

                callCurrentWord = "";

                document.getElementById('call-word-box').textContent = "";
            }
        }
    );

    document.getElementById('btn-call-send-text')?.addEventListener(
        'click',
        () => {

            const msg = callChatInput?.value.trim();

            if (msg) {

                sendCallMessage(msg, 'text_to_sign');

                appendCallLog('You', msg, 'text');

                callChatInput.value = '';
            }
        }
    );

    callChatInput?.addEventListener('keydown', (e) => {

        if (e.key === 'Enter') {

            const msg = callChatInput.value.trim();

            if (msg) {

                sendCallMessage(msg, 'text_to_sign');

                appendCallLog('You', msg, 'text');

                callChatInput.value = '';
            }
        }
    });

    document.getElementById('btn-call-speak-text')?.addEventListener(
        'click',
        () => {

            const msg = callChatInput?.value.trim();

            if (msg) {

                const selectedLang =
                    document.getElementById('lang-select').value;

                speakText(
                    msg,
                    selectedLang === 'kn' ? 'kn-IN' : 'en-US'
                );
            }
        }
    );

    // Camera toggle

    document.getElementById('btn-toggle-cam')?.addEventListener(
        'click',
        (e) => {

            if (localStream) {

                const videoTrack =
                    localStream.getVideoTracks()[0];

                if (!videoTrack) return;

                videoTrack.enabled = !videoTrack.enabled;

                const btn = e.currentTarget;

                if (videoTrack.enabled) {

                    btn.classList.add('active-control');
                    btn.classList.remove('inactive-control');

                    btn.innerHTML =
                        '<i class="fa-solid fa-video"></i>';

                } else {

                    btn.classList.remove('active-control');
                    btn.classList.add('inactive-control');

                    btn.innerHTML =
                        '<i class="fa-solid fa-video-slash"></i>';
                }
            }
        }
    );

    // Microphone toggle

    document.getElementById('btn-toggle-mic')?.addEventListener(
        'click',
        (e) => {

            if (localStream) {

                const audioTrack =
                    localStream.getAudioTracks()[0];

                if (!audioTrack) return;

                audioTrack.enabled = !audioTrack.enabled;

                const btn = e.currentTarget;

                if (audioTrack.enabled) {

                    btn.classList.add('active-control');
                    btn.classList.remove('inactive-control');

                    btn.innerHTML =
                        '<i class="fa-solid fa-microphone"></i>';

                } else {

                    btn.classList.remove('active-control');
                    btn.classList.add('inactive-control');

                    btn.innerHTML =
                        '<i class="fa-solid fa-microphone-slash"></i>';
                }
            }
        }
    );

    // Tracking toggle

    document.getElementById('btn-toggle-tracking')?.addEventListener(
        'click',
        (e) => {

            isTrackingActive = !isTrackingActive;

            const btn = e.currentTarget;

            if (isTrackingActive) {

                btn.classList.add('btn-success');
                btn.classList.remove('btn-danger');

                btn.innerHTML =
                    '<i class="fa-solid fa-hands-asl-interpreting"></i>';

            } else {

                btn.classList.remove('btn-success');
                btn.classList.add('btn-danger');

                btn.innerHTML =
                    '<i class="fa-solid fa-hands-asl-interpreting-slash"></i>';

                document.getElementById('call-local-pred').textContent = "?";
                document.getElementById('call-local-conf').textContent = "0";
            }
        }
    );

    btnLeaveCall?.addEventListener('click', leaveCall);

    // Module 3 microphone input

    if (recognition && btnCallMic) {

        btnCallMic.addEventListener('click', () => {

            if (btnCallMic.classList.contains('recording')) {

                recognition.stop();

            } else {

                callChatInput.value = '';

                const selectedLang =
                    document.getElementById('lang-select').value;

                recognition.lang =
                    selectedLang === 'kn' ? 'kn-IN' : 'en-US';

                const originalOnResult = recognition.onresult;
                const originalOnEnd = recognition.onend;
                const originalOnStart = recognition.onstart;

                recognition.onstart = function () {
                    btnCallMic.classList.add('recording');
                };

                recognition.onresult = function (event) {
                    callChatInput.value =
                        event.results[0][0].transcript;
                };

                recognition.onend = function () {

                    btnCallMic.classList.remove('recording');

                    recognition.onresult = originalOnResult;
                    recognition.onend = originalOnEnd;
                    recognition.onstart = originalOnStart;
                };

                recognition.start();
            }
        });
    }

    // Module 3 keyboard shortcuts

    document.addEventListener('keydown', (e) => {

        if (!document.getElementById('module3')?.classList.contains('active')) {
            return;
        }

        if (
            document.activeElement === callChatInput ||
            document.activeElement === callRoomInput
        ) {
            return;
        }

        if (
            ['Space', 'Enter', 'Backspace', 'c', 'C'].includes(e.key) ||
            e.code === 'Space'
        ) {
            e.preventDefault();
        }

        if (e.code === 'Space') {

            document.getElementById('btn-call-add')?.click();

        } else if (e.code === 'Enter') {

            document.getElementById('btn-call-send-word')?.click();

        } else if (e.code === 'Backspace') {

            document.getElementById('btn-call-back')?.click();

        } else if ((e.key || '').toLowerCase() === 'c') {

            document.getElementById('btn-call-clear')?.click();
        }
    });

    // =========================================================
    // INITIALIZE MODULE 1
    // =========================================================

    const module1 = document.getElementById('module1');

    if (module1?.classList.contains('active')) {

        startModule1Camera();
        startPollingState();
    }

    console.log("[ISL] Application initialized successfully.");

});
