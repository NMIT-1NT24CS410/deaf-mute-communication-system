document.addEventListener('DOMContentLoaded', () => {
    
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
            currentPredEl.textContent = data.current_prediction;
            predConfEl.textContent = Math.round(data.confidence * 100);
            currentWordEl.textContent = data.current_word;
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
                speakText(data.word);
            }
            fetchState(); // Immediate update
        } catch (e) {
            console.error('Action error:', e);
        }
    }

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

    // Browser Speech Synthesis
    function speakText(text) {
        if (!text) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; // Slightly slower for clarity
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
                speakText(text);
            }
        });
    }

    async function startTranslation() {
        const text = textInput.value.trim();
        if (!text || isSlideshowRunning) return;

        try {
            const res = await fetch('/text_to_sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await res.json();
            
            if (data.chars && data.chars.length > 0) {
                runSlideshow(data.chars, text);
            } else {
                alert("No alphanumeric characters found to translate.");
            }
        } catch (e) {
            console.error('Translation error:', e);
        }
    }

    async function runSlideshow(chars, originalText) {
        isSlideshowRunning = true;
        slideshowArea.style.display = 'flex';
        playingWordEl.textContent = originalText;
        
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            slideCounter.textContent = `${i + 1} / ${chars.length}`;
            progressBar.style.width = `${((i + 1) / chars.length) * 100}%`;
            
            // Try loading image
            await displaySign(char);
            
            // Wait 1.5s per sign
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Reset
        isSlideshowRunning = false;
        setTimeout(() => {
            slideshowArea.style.display = 'none';
            textInput.value = '';
        }, 1000);
    }

    function displaySign(char) {
        return new Promise((resolve) => {
            const imgUrl = `/signs/${char}.jpg`;
            const img = new Image();
            
            img.onload = () => {
                signImgEl.src = imgUrl;
                signImgEl.style.display = 'block';
                placeholderEl.style.display = 'none';
                resolve();
            };
            
            img.onerror = () => {
                // If .jpg fails, could try .png, but for simplicity we fall back to placeholder
                signImgEl.style.display = 'none';
                placeholderEl.style.display = 'flex';
                placeholderCharEl.textContent = char;
                resolve();
            };
            
            img.src = imgUrl;
        });
    }

    // Initialize stream on load if module1 is active
    if (document.getElementById('module1').classList.contains('active')) {
        videoStream.src = '/video_feed';
        startPollingState();
    }
});
