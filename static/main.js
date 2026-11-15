document.addEventListener('DOMContentLoaded', () => {
    
    // Warm up speech synthesis voices on load
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
    
    // --- Translation Dictionary and Helpers ---
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

    // Cache to avoid rate-limiting translation requests
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
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=kn&dt=t&q=${encodeURIComponent(cleanText)}`;
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
            // Translate Kannada to English
            if (TRANSLATIONS.kn_to_en[cleanText]) {
                return TRANSLATIONS.kn_to_en[cleanText];
            }
            // Check reverse keys by split/join if sentence
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
            if (allFound) return translatedWords.join(" ");

            try {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=kn&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;
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
        const selectedLang = document.getElementById('lang-select').value;
        
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

    // --- Navigation ---
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.module-section');
    const videoStream = document.getElementById('video-stream');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Update Active Link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Switch Section
            const targetId = link.getAttribute('data-target');
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // Handle Video Stream
            if (targetId === 'module1') {
                videoStream.src = '/video_feed';
                startPollingState();
            } else {
                videoStream.src = ''; // Stop streaming to save resources
                stopPollingState();
            }

            // Leave call if navigating away from Video Call
            if (targetId !== 'module3') {
                if (typeof leaveCall === 'function') {
                    leaveCall();
                }
            }
        });
    });

    // --- Module 1: Sign to Speech ---
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
            
            const selectedLang = document.getElementById('lang-select').value;
            const { wordTrans, predTrans } = await getTranslatedState(data.current_word, data.current_prediction);
            
            if (selectedLang === 'kn' && data.current_prediction !== "?") {
                currentPredEl.textContent = `${data.current_prediction} (${predTrans})`;
            } else {
                currentPredEl.textContent = data.current_prediction;
            }
            
            predConfEl.textContent = Math.round(data.confidence * 100);
            currentWordEl.textContent = wordTrans;
        } catch (e) {
            console.error('Error fetching state:', e);
        }
    }

    async function sendAction(action) {
        try {
            const res = await fetch('/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (action === 'speak' && data.word) {
                const selectedLang = document.getElementById('lang-select').value;
                if (selectedLang === 'kn') {
                    const translatedWord = await translateText(data.word, 'kn');
                    speakText(translatedWord, 'kn-IN');
                } else {
                    speakText(data.word, 'en-US');
                }
            }
            fetchState(); // Immediate update
        } catch (e) {
            console.error('Action error:', e);
        }
    }

    // Dynamic state clearing on language change
    document.getElementById('lang-select').addEventListener('change', () => {
        lastEnglishWord = "";
        cachedKannadaWord = "";
        lastEnglishPred = "";
        cachedKannadaPred = "";
        fetchState();
    });

    // Module 1 Buttons
    document.getElementById('btn-add').addEventListener('click', () => sendAction('add'));
    document.getElementById('btn-speak').addEventListener('click', () => sendAction('speak'));
    document.getElementById('btn-back').addEventListener('click', () => sendAction('backspace'));
    document.getElementById('btn-clear').addEventListener('click', () => sendAction('clear'));

    // Keyboard shortcuts for Module 1
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('module1').classList.contains('active')) return;
        
        // Prevent defaults if it's our shortcuts
        if (['Space', 'Enter', 'Backspace', 'c', 'C'].includes(e.key) || e.code === 'Space') {
            e.preventDefault();
        }

        if (e.code === 'Space') sendAction('add');
        else if (e.code === 'Enter') sendAction('speak');
        else if (e.code === 'Backspace') sendAction('backspace');
        else if (e.key.toLowerCase() === 'c') sendAction('clear');
    });

    // Browser Speech Synthesis with language support
    function speakText(text, lang = 'en-US') {
        if (!text) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.lang = lang;
        
        // Find matching voice
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(lang));
        if (voice) {
            utterance.voice = voice;
        }
        window.speechSynthesis.speak(utterance);
    }


    // --- Module 2: Text/Speech to Sign ---
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

    // Web Speech API for Mic Input
    let recognition;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = function() {
            btnMic.classList.add('recording');
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            textInput.value = transcript;
        };

        recognition.onerror = function(event) {
            console.error('Speech recognition error', event.error);
            btnMic.classList.remove('recording');
            alert('Could not recognize speech. Please try again.');
        };

        recognition.onend = function() {
            btnMic.classList.remove('recording');
            // Auto translate after speaking
            if(textInput.value.trim() !== '') {
                startTranslation();
            }
        };

        btnMic.addEventListener('click', () => {
            if (btnMic.classList.contains('recording')) {
                recognition.stop();
            } else {
                textInput.value = '';
                const selectedLang = document.getElementById('lang-select').value;
                recognition.lang = selectedLang === 'kn' ? 'kn-IN' : 'en-US';
                recognition.start();
            }
        });
    } else {
        btnMic.style.display = 'none'; // Hide if unsupported
    }

    btnTranslate.addEventListener('click', startTranslation);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startTranslation();
    });

    const btnTextToSpeech = document.getElementById('btn-text-to-speech');
    if (btnTextToSpeech) {
        btnTextToSpeech.addEventListener('click', () => {
            const text = textInput.value.trim();
            if (text) {
                const selectedLang = document.getElementById('lang-select').value;
                speakText(text, selectedLang === 'kn' ? 'kn-IN' : 'en-US');
            }
        });
    }

    async function startTranslation() {
        const text = textInput.value.trim();
        if (!text || isSlideshowRunning) return;

        const selectedLang = document.getElementById('lang-select').value;
        let queryText = text;

        if (selectedLang === 'kn') {
            // Translate Kannada input back to English for Sign dataset mapping
            queryText = await translateText(text, 'en');
            console.log(`Bilingual Text-to-Sign: Translated Kannada "${text}" to English "${queryText}"`);
        }

        try {
            const res = await fetch('/text_to_sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: queryText })
            });
            const data = await res.json();
            
            if (data.steps && data.steps.length > 0) {
                runSlideshow(data.steps, text);
            } else {
                alert("No alphanumeric characters or words found to translate.");
            }
        } catch (e) {
            console.error('Translation error:', e);
        }
    }

    function preloadFrames(frameUrls) {
        return Promise.all(frameUrls.map(url => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            });
        }));
    }

    async function runSlideshow(steps, originalText) {
        isSlideshowRunning = true;
        slideshowArea.style.display = 'flex';
        playingWordEl.textContent = originalText;
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            slideCounter.textContent = `${i + 1} / ${steps.length}`;
            progressBar.style.width = `${((i + 1) / steps.length) * 100}%`;
            
            if (step.frames.length > 1) {
                // Play dynamic word animation
                // Preload all frames for smooth playback
                await preloadFrames(step.frames);
                
                // Render animation at ~120ms per frame (increase to slow down, decrease to speed up)
                const animationFrameDelay = 120;
                for (let f = 0; f < step.frames.length; f++) {
                    signImgEl.src = step.frames[f];
                    signImgEl.style.display = 'block';
                    placeholderEl.style.display = 'none';
                    await new Promise(resolve => setTimeout(resolve, animationFrameDelay));
                }
                // Leave the final frame on screen briefly
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                // Single sign (character or static image)
                await displaySign(step.frames[0], step.label);
                await new Promise(resolve => setTimeout(resolve, 1200));
            }
        }

        // Reset
        isSlideshowRunning = false;
        setTimeout(() => {
            slideshowArea.style.display = 'none';
            textInput.value = '';
        }, 1000);
    }

    function displaySign(url, label) {
        return new Promise((resolve) => {
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
                if (label.length > 1) {
                    placeholderCharEl.style.fontSize = '2rem';
                } else {
                    placeholderCharEl.style.fontSize = ''; // Fallback to CSS default (5rem)
                }
                resolve();
            };
            
            img.src = url;
        });
    }

    // --- Module 3: Video Call ---
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

    const callRoomInput = document.getElementById('call-room-input');
    const btnJoinCall = document.getElementById('btn-join-call');
    const btnLeaveCall = document.getElementById('btn-leave-call');
    const callStatusEl = document.getElementById('call-status');
    const videoCallSetup = document.getElementById('video-call-setup');
    const videoCallActive = document.getElementById('video-call-active');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callChatInput = document.getElementById('call-chat-input');
    const btnCallMic = document.getElementById('btn-call-mic');

    let isMiniSlideshowRunning = false;

    function appendCallLog(sender, text, type) {
        const chatLogs = document.getElementById('call-chat-logs');
        if (!chatLogs) return;
        
        const placeholder = chatLogs.querySelector('.system-message');
        if (placeholder) placeholder.remove();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-log-msg';
        msgDiv.style.padding = '8px 12px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.fontSize = '0.95rem';
        msgDiv.style.lineHeight = '1.4';
        msgDiv.style.maxWidth = '80%';
        msgDiv.style.display = 'inline-block';
        msgDiv.style.width = 'fit-content';
        
        if (sender === 'You') {
            msgDiv.style.alignSelf = 'flex-end';
            if (type === 'sign') {
                msgDiv.style.background = 'rgba(74, 222, 128, 0.15)';
                msgDiv.style.border = '1px solid rgba(74, 222, 128, 0.4)';
                msgDiv.innerHTML = `<strong>You (Sign):</strong> ${text}`;
            } else {
                msgDiv.style.background = 'rgba(59, 130, 246, 0.15)';
                msgDiv.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                msgDiv.innerHTML = `<strong>You (Text):</strong> ${text}`;
            }
        } else {
            msgDiv.style.alignSelf = 'flex-start';
            if (type === 'sign') {
                msgDiv.style.background = 'rgba(251, 191, 36, 0.15)';
                msgDiv.style.border = '1px solid rgba(251, 191, 36, 0.4)';
                msgDiv.innerHTML = `<strong>Peer (Sign):</strong> ${text}`;
            } else {
                msgDiv.style.background = 'rgba(167, 139, 250, 0.15)';
                msgDiv.style.border = '1px solid rgba(167, 139, 250, 0.4)';
                msgDiv.innerHTML = `<strong>Peer (Text):</strong> ${text}`;
            }
        }
        
        chatLogs.appendChild(msgDiv);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    }

    btnJoinCall.addEventListener('click', async () => {
        roomCode = callRoomInput.value.trim();
        const nameInput = document.getElementById('call-name-input');
        userName = nameInput ? nameInput.value.trim() : "";
        if (!userName) userName = "User";
        if (!roomCode) {
            alert("Please enter a Room ID.");
            return;
        }

        // Initialize SocketIO client
        socket = io(window.location.origin);

        // Clear chat logs
        const chatLogs = document.getElementById('call-chat-logs');
        if (chatLogs) chatLogs.innerHTML = `<div class="system-message" style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem; text-align: center;">Connecting to room...</div>`;

        // Request camera and mic
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;

            videoCallSetup.style.display = 'none';
            videoCallActive.style.display = 'block';
            callStatusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected to Room: ${roomCode}`;

            // Join socket room
            socket.emit('join', { room: roomCode, name: userName });

            // Start processing hand landmarks locally and sending to server
            startCallPrediction();

            // Initialize PeerConnection
            initializePeerConnection();
        } catch (e) {
            console.error("Camera access failed:", e);
            alert("Failed to access camera/microphone. Ensure you are using HTTPS or localhost.");
        }
    });

    function initializePeerConnection() {
        peerConnection = new RTCPeerConnection(peerConfiguration);

        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Remote track handling
        peerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };

        // ICE candidate signaling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', {
                    room: roomCode,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // When a peer joins, the initiator creates an offer
        socket.on('peer-joined', async (data) => {
            peerName = data.name || "Peer";
            console.log("[WebRTC] Peer joined, sending offer... Name:", peerName);
            
            // Update remote header
            const remoteHeader = document.querySelector('.video-card:nth-child(2) .video-card-header h3');
            if (remoteHeader) {
                remoteHeader.innerHTML = `<i class="fa-solid fa-user-group"></i> Remote Feed (${peerName})`;
            }
            
            // Append system message to chat logs
            const chatLogs = document.getElementById('call-chat-logs');
            if (chatLogs) {
                const sysMsg = document.createElement('div');
                sysMsg.className = 'system-message';
                sysMsg.style.color = '#10b981';
                sysMsg.style.fontStyle = 'italic';
                sysMsg.style.fontSize = '0.9rem';
                sysMsg.style.textAlign = 'center';
                sysMsg.textContent = `${peerName} joined the call.`;
                chatLogs.appendChild(sysMsg);
            }

            // Introduce our name to the peer
            socket.emit('signal', {
                room: roomCode,
                type: 'name-intro',
                name: userName
            });

            try {
                const offer = await peerConnection.createOffer();
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

        // Handle incoming WebRTC signals
        socket.on('signal', async (data) => {
            try {
                if (data.type === 'name-intro') {
                    peerName = data.name || "Peer";
                    const remoteHeader = document.querySelector('.video-card:nth-child(2) .video-card-header h3');
                    if (remoteHeader) {
                        remoteHeader.innerHTML = `<i class="fa-solid fa-user-group"></i> Remote Feed (${peerName})`;
                    }
                    return;
                }
                
                if (data.type === 'offer') {
                    console.log("[WebRTC] Received offer, sending answer...");
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit('signal', {
                        room: roomCode,
                        type: 'answer',
                        sdp: answer
                    });
                } else if (data.type === 'answer') {
                    console.log("[WebRTC] Received answer, setting remote description...");
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                } else if (data.type === 'candidate') {
                    console.log("[WebRTC] Received candidate...");
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } catch (e) {
                console.error("[WebRTC] Signaling error:", e);
            }
        });

        // Handle incoming chat messages
        socket.on('chat-message', (data) => {
            handleIncomingMessage(data);
        });
    }

    function startCallPrediction() {
        if (predictTimer) clearInterval(predictTimer);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        predictTimer = setInterval(async () => {
            if (isProcessingFrame) return; // Flow control: skip if a frame is already in flight
            if (!isTrackingActive || !localStream) return;
            if (localVideo.videoWidth === 0) return;

            isProcessingFrame = true;

            const maxDim = 320; // Reduced dimension for extremely fast transmission
            let w = localVideo.videoWidth;
            let h = localVideo.videoHeight;
            if (w > maxDim) {
                h = Math.round(h * (maxDim / w));
                w = maxDim;
            }
            canvas.width = w;
            canvas.height = h;
            context.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Slightly lower quality for smaller payload size

            // Fallback to fetch if socket is not connected or available
            if (!socket || !socket.connected) {
                try {
                    const res = await fetch('/predict', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: dataUrl })
                    });
                    const data = await res.json();
                    handlePredictionResult(data);
                } catch (e) {
                    console.error("Frame prediction error (HTTP fallback):", e);
                } finally {
                    isProcessingFrame = false;
                }
            } else {
                // Emit via Socket.IO using acknowledgment callback
                socket.emit('predict-frame', { image: dataUrl }, (data) => {
                    handlePredictionResult(data);
                    isProcessingFrame = false;
                });
            }
        }, 150); // Faster interval for real-time responsiveness (150ms)
    }

    function handlePredictionResult(data) {
        if (!data) return;
        const pred = data.prediction || "?";
        const conf = Math.round((data.confidence || 0) * 100);

        document.getElementById('call-local-pred').textContent = pred;
        document.getElementById('call-local-conf').textContent = conf;

        if (pred !== "?") {
            if (pred === callLastPrediction) {
                callStableFrames++;
                if (callStableFrames === 5) { // Faster stabilization (5 frames)
                    // Update word box locally
                    if (pred.length > 1) {
                        if (callCurrentWord && !callCurrentWord.endsWith(" ")) {
                            callCurrentWord += " ";
                        }
                        callCurrentWord += pred + " ";
                    } else {
                        callCurrentWord += pred;
                    }
                    document.getElementById('call-word-box').textContent = callCurrentWord;

                    // AUTO-SEND to the other user without delay (prevents duplicate spam using lastSentSign)
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
            lastSentSign = ""; // Reset sent sign tracker when hand is removed
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

    async function handleIncomingMessage(data) {
        const { text, type } = data;
        if (type === 'sign_to_text') {
            appendCallLog('Peer', text, 'sign');
            const remoteCaptions = document.getElementById('remote-captions');
            remoteCaptions.textContent = text;
            remoteCaptions.classList.add('active-caption');

            setTimeout(() => {
                if (remoteCaptions.textContent === text) {
                    remoteCaptions.textContent = "Waiting for peer signs...";
                    remoteCaptions.classList.remove('active-caption');
                }
            }, 6000);

            // Auto speak
            const chkAutoSpeak = document.getElementById('chk-auto-speak');
            if (chkAutoSpeak && chkAutoSpeak.checked) {
                const selectedLang = document.getElementById('lang-select').value;
                if (selectedLang === 'kn') {
                    const translated = await translateText(text, 'kn');
                    speakText(translated, 'kn-IN');
                } else {
                    speakText(text, 'en-US');
                }
            }
        } else if (type === 'text_to_sign') {
            appendCallLog('Peer', text, 'text');
            const chkAutoSign = document.getElementById('chk-auto-sign');
            if (chkAutoSign && chkAutoSign.checked) {
                playMiniSlideshow(text);
            }
        }
    }

    async function playMiniSlideshow(text) {
        if (isMiniSlideshowRunning) return;
        isMiniSlideshowRunning = true;
        miniSlideshow.style.display = 'flex';
        miniPlayingWord.textContent = text;

        const selectedLang = document.getElementById('lang-select').value;
        let queryText = text;
        if (selectedLang === 'kn') {
            queryText = await translateText(text, 'en');
        }

        try {
            const res = await fetch('/text_to_sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: queryText })
            });
            const data = await res.json();

            if (data.steps && data.steps.length > 0) {
                for (let i = 0; i < data.steps.length; i++) {
                    const step = data.steps[i];
                    if (step.frames.length > 1) {
                        await preloadFrames(step.frames);
                        const animationFrameDelay = 120;
                        for (let f = 0; f < step.frames.length; f++) {
                            miniSignImg.src = step.frames[f];
                            miniSignImg.style.display = 'block';
                            miniPlaceholder.style.display = 'none';
                            await new Promise(resolve => setTimeout(resolve, animationFrameDelay));
                        }
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } else {
                        await displayMiniSign(step.frames[0], step.label);
                        await new Promise(resolve => setTimeout(resolve, 1200));
                    }
                }
            }
        } catch (e) {
            console.error("Mini slideshow error:", e);
        }

        isMiniSlideshowRunning = false;
        setTimeout(() => {
            miniSlideshow.style.display = 'none';
        }, 1000);
    }

    function displayMiniSign(url, label) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                miniSignImg.src = url;
                miniSignImg.style.display = 'block';
                miniPlaceholder.style.display = 'none';
                resolve();
            };
            img.onerror = () => {
                miniSignImg.style.display = 'none';
                miniPlaceholder.style.display = 'flex';
                miniPlaceholderChar.textContent = label;
                resolve();
            };
            img.src = url;
        });
    }

    function leaveCall() {
        if (predictTimer) {
            clearInterval(predictTimer);
            predictTimer = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
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

        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        remoteStream = null;

        peerName = "Peer";
        const remoteHeader = document.querySelector('.video-card:nth-child(2) .video-card-header h3');
        if (remoteHeader) {
            remoteHeader.innerHTML = `<i class="fa-solid fa-user-group"></i> Remote Feed (Peer)`;
        }

        const chatLogs = document.getElementById('call-chat-logs');
        if (chatLogs) chatLogs.innerHTML = `<div class="system-message" style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem; text-align: center;">Waiting for call participants...</div>`;

        callCurrentWord = "";
        lastSentSign = "";
        isProcessingFrame = false;
        const box = document.getElementById('call-word-box');
        if (box) box.textContent = "";
        const localPred = document.getElementById('call-local-pred');
        if (localPred) localPred.textContent = "?";
        const localConf = document.getElementById('call-local-conf');
        if (localConf) localConf.textContent = "0";

        videoCallActive.style.display = 'none';
        videoCallSetup.style.display = 'block';
        callStatusEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Status: Disconnected`;
    }

    // Module 3 UI Buttons setup
    document.getElementById('btn-call-add').addEventListener('click', () => {
        const pred = document.getElementById('call-local-pred').textContent;
        if (pred && pred !== "?") {
            if (pred.length > 1) {
                if (callCurrentWord && !callCurrentWord.endsWith(" ")) {
                    callCurrentWord += " ";
                }
                callCurrentWord += pred + " ";
            } else {
                callCurrentWord += pred;
            }
            document.getElementById('call-word-box').textContent = callCurrentWord;
        }
    });

    document.getElementById('btn-call-back').addEventListener('click', () => {
        if (callCurrentWord.length > 0) {
            callCurrentWord = callCurrentWord.slice(0, -1);
            document.getElementById('call-word-box').textContent = callCurrentWord;
        }
    });

    document.getElementById('btn-call-clear').addEventListener('click', () => {
        callCurrentWord = "";
        document.getElementById('call-word-box').textContent = "";
    });

    document.getElementById('btn-call-send-word').addEventListener('click', () => {
        if (callCurrentWord.trim() !== "") {
            const word = callCurrentWord.trim();
            sendCallMessage(word, 'sign_to_text');
            appendCallLog('You', word, 'sign');
            callCurrentWord = "";
            document.getElementById('call-word-box').textContent = "";
        }
    });

    document.getElementById('btn-call-send-text').addEventListener('click', () => {
        const msg = callChatInput.value.trim();
        if (msg) {
            sendCallMessage(msg, 'text_to_sign');
            appendCallLog('You', msg, 'text');
            callChatInput.value = '';
        }
    });

    callChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const msg = callChatInput.value.trim();
            if (msg) {
                sendCallMessage(msg, 'text_to_sign');
                appendCallLog('You', msg, 'text');
                callChatInput.value = '';
            }
        }
    });

    document.getElementById('btn-call-speak-text').addEventListener('click', () => {
        const msg = callChatInput.value.trim();
        if (msg) {
            const selectedLang = document.getElementById('lang-select').value;
            speakText(msg, selectedLang === 'kn' ? 'kn-IN' : 'en-US');
        }
    });

    document.getElementById('btn-toggle-cam').addEventListener('click', (e) => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            const btn = e.currentTarget;
            if (videoTrack.enabled) {
                btn.classList.add('active-control');
                btn.classList.remove('inactive-control');
                btn.innerHTML = '<i class="fa-solid fa-video"></i>';
            } else {
                btn.classList.remove('active-control');
                btn.classList.add('inactive-control');
                btn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
            }
        }
    });

    document.getElementById('btn-toggle-mic').addEventListener('click', (e) => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            const btn = e.currentTarget;
            if (audioTrack.enabled) {
                btn.classList.add('active-control');
                btn.classList.remove('inactive-control');
                btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            } else {
                btn.classList.remove('active-control');
                btn.classList.add('inactive-control');
                btn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            }
        }
    });

    document.getElementById('btn-toggle-tracking').addEventListener('click', (e) => {
        isTrackingActive = !isTrackingActive;
        const btn = e.currentTarget;
        if (isTrackingActive) {
            btn.classList.add('btn-success');
            btn.classList.remove('btn-danger');
            btn.innerHTML = '<i class="fa-solid fa-hands-asl-interpreting"></i>';
        } else {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-danger');
            btn.innerHTML = '<i class="fa-solid fa-hands-asl-interpreting-slash"></i>';
            document.getElementById('call-local-pred').textContent = "?";
            document.getElementById('call-local-conf').textContent = "0";
        }
    });

    btnLeaveCall.addEventListener('click', leaveCall);

    if (recognition && btnCallMic) {
        btnCallMic.addEventListener('click', () => {
            if (btnCallMic.classList.contains('recording')) {
                recognition.stop();
            } else {
                callChatInput.value = '';
                const selectedLang = document.getElementById('lang-select').value;
                recognition.lang = selectedLang === 'kn' ? 'kn-IN' : 'en-US';

                const originalOnResult = recognition.onresult;
                const originalOnEnd = recognition.onend;
                const originalOnStart = recognition.onstart;

                recognition.onstart = function() {
                    btnCallMic.classList.add('recording');
                };
                recognition.onresult = function(event) {
                    callChatInput.value = event.results[0][0].transcript;
                };
                recognition.onend = function() {
                    btnCallMic.classList.remove('recording');
                    recognition.onresult = originalOnResult;
                    recognition.onend = originalOnEnd;
                    recognition.onstart = originalOnStart;
                };
                recognition.start();
            }
        });
    }

    // Keyboard shortcuts for Module 3
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('module3').classList.contains('active')) return;
        if (document.activeElement === callChatInput || document.activeElement === callRoomInput) return;

        if (['Space', 'Enter', 'Backspace', 'c', 'C'].includes(e.key) || e.code === 'Space') {
            e.preventDefault();
        }

        if (e.code === 'Space') {
            document.getElementById('btn-call-add').click();
        } else if (e.code === 'Enter') {
            document.getElementById('btn-call-send-word').click();
        } else if (e.code === 'Backspace') {
            document.getElementById('btn-call-back').click();
        } else if (e.key.toLowerCase() === 'c') {
            document.getElementById('btn-call-clear').click();
        }
    });

    // Initialize stream on load if module1 is active
    if (document.getElementById('module1').classList.contains('active')) {
        videoStream.src = '/video_feed';
        startPollingState();
    }
});
