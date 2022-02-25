$(function () {
    var socket = io();

    $.fn.pressEnter = function (fn) {

        return this.each(function () {
            $(this).bind('enterPress', fn);
            $(this).keyup(function (e) {
                if (e.keyCode == 13) {
                    $(this).trigger("enterPress");
                }
            })
        });
    };

    var sendChatMessage = function () {
        console.log($('#query').val());
        socket.emit('chat message', $('#query').val());
        $('#query').val('');
        return false;
    }

    $('#query').pressEnter(sendChatMessage)
    $('#send').click(sendChatMessage);

    socket.on('chat message', function (msg) {
        console.log(msg);
        var elem = $(`<div class="d-flex flex-row justify-content-end mb-4">
                        <div class="p-3 me-3 border" style="border-radius: 15px; background-color: #fbfbfb;">
                        <p class="small mb-0">${msg}</p>
                        </div>
                        <img src="img/ava2-bg.webp"
                        alt="avatar 1" style="width: 45px; height: 100%;">
                    </div>`);
        let messages = $('#messages');

        $('#messages').append(elem);
        $('#messages').animate({ scrollTop: messages[0].scrollHeight }, 1000);
    });

    socket.on('bot message', function (msg) {
        console.log(msg);
        var elem = $(`<div class="d-flex flex-row justify-content-start mb-4">
                        <img src="img/ava5-bg.webp"
                        alt="avatar 1" style="width: 45px; height: 100%;">
                        <div class="p-3 ms-3" style="border-radius: 15px; background-color: rgba(57, 192, 237,.2);">
                        <p class="small mb-0">${msg}</p>
                        </div>
                    </div>`);
        let messages = $('#messages');

        $('#messages').append(elem);
        $('#messages').animate({ scrollTop: messages[0].scrollHeight }, 1000);
    });

    let speakButton = $('#speak');
    let recordAudioRTC;
    let streamAudioRTC;

    // on start button handler
    speakButton.click(function () {
        if (streamAudioRTC) {
            if (streamAudioRTC.state === 'recording')
                streamAudioRTC.stopRecording();

            streamAudioRTC.destroy();
            streamAudioRTC = null;
            streamButton.removeClass("rec");
        }

        if (!recordAudioRTC) {
            navigator.mediaDevices.getUserMedia({
                audio: true
            }).then(async function (stream) {
                recordAudioRTC = RecordRTC(stream, {
                    type: 'audio',
                    mimeType: 'audio/webm',
                    sampleRate: 44100, // this sampleRate should be the same in your server code

                    // MediaStreamRecorder, StereoAudioRecorder, WebAssemblyRecorder
                    // CanvasRecorder, GifRecorder, WhammyRecorder
                    recorderType: StereoAudioRecorder,

                    // Dialogflow / STT requires mono audio
                    numberOfAudioChannels: 1,

                    // get intervals based blobs
                    // value in milliseconds
                    // as you might not want to make detect calls every seconds
                    timeSlice: 4000,

                    // only for audio track
                    // audioBitsPerSecond: 128000,

                    // used by StereoAudioRecorder
                    // the range 22050 to 96000.
                    // let us force 16khz recording:
                    desiredSampRate: 16000
                });

                recordAudioRTC.startRecording();
                speakButton.addClass("rec");
            });
        }

        if (recordAudioRTC) {
            if (recordAudioRTC.state === 'stopped') {
                recordAudioRTC.reset();
                recordAudioRTC.startRecording();
                speakButton.addClass("rec");
            }
            // recording started
            else if (recordAudioRTC.state === 'recording') {
                // stop audio recorder
                recordAudioRTC.stopRecording(function () {
                    speakButton.removeClass("rec");
                    // after stopping the audio, get the audio data
                    recordAudioRTC.getDataURL(function (audioDataURL) {
                        var files = {
                            audio: {
                                type: recordAudioRTC.getBlob().type || 'audio/wav',
                                dataURL: audioDataURL
                            }
                        };
                        // submit the audio file to the server
                        socket.emit('message-transcribe', files);
                    });
                });
            }
        }
    });

    let streamButton = $('#stream');
    let audioStream;

    streamButton.click(function () {
        if (recordAudioRTC) {
            if (recordAudioRTC.state === 'recording')
                recordAudioRTC.stopRecording();

            recordAudioRTC.destroy();
            recordAudioRTC = null;
            speakButton.removeClass("rec");
        }

        if (!streamAudioRTC) {
            navigator.mediaDevices.getUserMedia({
                audio: true
            }).then(async function (stream) {
                streamAudioRTC = RecordRTC(stream, {
                    type: 'audio',
                    mimeType: 'audio/webm',
                    sampleRate: 44100,
                    desiredSampRate: 16000,

                    recorderType: StereoAudioRecorder,
                    numberOfAudioChannels: 1,


                    //1)
                    // get intervals based blobs
                    // value in milliseconds
                    // as you might not want to make detect calls every seconds
                    timeSlice: 4000,

                    //2)
                    // as soon as the stream is available
                    ondataavailable: function (blob) {

                        // 3
                        // making use of socket.io-stream for bi-directional
                        // streaming, create a stream
                        audioStream = ss.createStream();
                        // stream directly to server
                        // it will be temp. stored locally
                        ss(socket).emit('stream', audioStream, {
                            name: socket.id + '.wav',
                            size: blob.size
                        });
                        // pipe the audio blob to the read stream
                        ss.createBlobReadStream(blob).pipe(audioStream);
                    }
                });

                streamAudioRTC.startRecording();
                streamButton.addClass("rec");
            });
        }

        if (streamAudioRTC) {
            if (streamAudioRTC.state === 'stopped') {
                streamAudioRTC.reset();
                streamAudioRTC.startRecording();
                streamButton.addClass("rec");
            }
            // recording started
            else if (streamAudioRTC.state === 'recording') {
                // stop audio recorder
                streamAudioRTC.stopRecording(function () {
                    streamButton.removeClass("rec");

                    // after stopping the audio, close the stream
                    audioStream.destroy();
                    audioStream = null;

                    socket.emit('stream-closed', socket.id + '.wav');
                });
            }
        }
    });
});

