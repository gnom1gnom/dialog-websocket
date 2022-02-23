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
        $('#messages').append(
            `<div class="d-flex flex-row justify-content-end mb-4">
            <div class="p-3 me-3 border" style="border-radius: 15px; background-color: #fbfbfb;">
              <p class="small mb-0">${msg}</p>
            </div>
            <img src="https://mdbcdn.b-cdn.net/img/Photos/new-templates/bootstrap-chat/ava2-bg.webp"
              alt="avatar 1" style="width: 45px; height: 100%;">
          </div>`
        );
        window.scrollTo(0, document.body.scrollHeight);
    });

    socket.on('bot message', function (msg) {
        console.log(msg);
        $('#messages').append(
            `<div class="d-flex flex-row justify-content-start mb-4">
            <img src="https://mdbcdn.b-cdn.net/img/Photos/new-templates/bootstrap-chat/ava5-bg.webp"
              alt="avatar 1" style="width: 45px; height: 100%;">
            <div class="p-3 ms-3" style="border-radius: 15px; background-color: rgba(57, 192, 237,.2);">
              <p class="small mb-0">${msg}</p>
            </div>
          </div>`
        );
        window.scrollTo(0, document.body.scrollHeight);
    });

    let speakButton = $('#speak');
    let recordAudio;

    // on start button handler
    speakButton.click(function () {

        if (!recordAudio) {
            // make use of HTML 5/WebRTC, JavaScript getUserMedia()
            // to capture the browser microphone stream
            navigator.getUserMedia({
                audio: true
            }, function (stream) {
                recordAudio = RecordRTC(stream, {
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

                recordAudio.startRecording();
            }, function (error) {
                console.error(JSON.stringify(error));
            });
        }

        if (recordAudio) {
            if (recordAudio.state === 'stopped') {
                recordAudio.reset();
                recordAudio.startRecording();
            }
            // recording started
            else if (recordAudio.state === 'recording') {
                // stop audio recorder
                recordAudio.stopRecording(function () {

                    // after stopping the audio, get the audio data
                    recordAudio.getDataURL(function (audioDataURL) {
                        var files = {
                            audio: {
                                type: recordAudio.getBlob().type || 'audio/wav',
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

});

