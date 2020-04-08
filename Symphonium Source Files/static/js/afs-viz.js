/////////////////////////////////////////////////////////////////////////////////////////////////////

(function () {

	var root = this;  														// use global context rather than window object
	var waveform_array, old_waveform, objectUrl, metaHide, micStream;		// raw waveform data from web audio api
	var WAVE_DATA = []; 													// normalized waveform data used in visualizations

	// main app/init stuff //////////////////////////////////////////////////////////////////////////
	var a = {};	
	a.init = function() {
		console.log("a.init fired");

		// globals & state
		var s = {
			version: '1.6.0',
			debug: (window.location.href.indexOf("debug") > -1) ? true : false,

			width : $(document).width(),
			height : $(document).height(),
			sliderVal: 50,												// depricated -- value of html5 slider
			canKick: true,												// rate limits auto kick detector
			metaLock: false,											// overrides .hideHUD() when song metadata needs to be shown

			vendors : ['-webkit-', '-moz-', '-o-', ''],

			drawInterval: 1000/24,										// 1000ms divided by max framerate
			then: Date.now(),											// last time a frame was drawn
			trigger: 'circle',											// default visualization

			hud: 1,														// is hud visible?
			active: null,												// active visualization (string)
			vizNum: 0,													// active visualization (index number)
			thumbs_init: [0,0,0,0,0,0,0,0],								// are thumbnails initialized?
			theme: 0, 													// default color palette
			currentSong : 0,											// current track

			soundCloudURL: null,
			soundCloudData: null,
			soundCloudTracks: null,

			loop: 1,													// current loop index
			loopDelay: [null,20000,5000,1000],							// array of loop options
			loopText: ['off', 'every 20s', 'every 5s', 'every 1s'],
			changeInterval: null										// initialize looping setInterval id

		};
		root.State = s;


		root.context = new (window.AudioContext || window.webkitAudioContext)();

		// append main svg element
		root.svg = d3.select("body").append("svg").attr('id', 'viz')
				.attr("width", State.width)
				.attr("height", State.height);

		a.bind();			// attach all the handlers
		a.keyboard();		// bind all the shortcuts

		if (window.location.protocol.search('chrome-extension') >= 0) {
			a.findAudio();
			return;
		}
		
		if (h.getURLParameter('sc') == null)
			a.loadSound();		
		else
			a.soundCloud();


		};
	a.bind = function() {
		console.log("a.bind fired");
		var click = (Helper.isMobile()) ? 'touchstart' : 'click';

		$('.wrapper').on(click, function() { h.toggleMenu('close'); });
	
		$('.icon-microphone').on(click, a.microphone);
		$('.icon-microphone').hover( function() {
			$( this ).append( $( "<span> Connect your microphone</span>" ) );
			}, function() {
			$( this ).find( "span:last" ).remove();
			});		
		

		document.addEventListener("waveform", function (e) { 
			//console.log(e.detail);
			waveform_array = e.detail;
			//audio = this;
		}, false);


		// hide HUD on idle mouse
		$('body').on('touchstart mousemove',function() {
			h.showHUD();
			clearTimeout(hide);
			hide = setTimeout(function() { h.hideHUD(); }, 2000);
		});
		hide = setTimeout(function() { h.hideHUD(); }, 2000);

		// update state on window resize
		window.onresize = function(event) { h.resize(); };
		$(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange', h.resize);  //http://stackoverflow.com/a/9775411


		};	
	
	a.microphone = function() {
		console.log('a.microphone fired');

		navigator.getUserMedia  = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

		if (micStream == null) {
			if (navigator.getUserMedia) {
				navigator.getUserMedia({audio: true, video: false}, function(stream) {
					 $("#loading, #listen").each(function() {
					 	$(this).show();
					 });					 	
					 setTimeout(function() { 
	                    $('#loading, #listen').each(function() {
	                    	$(this).fadeOut();
	                    })
	             	}, 5000);  
					 setTimeout(function() {
					 	$("#songname-container").fadeIn(5000).fadeOut(5000);
					 	$("#songname").fadeIn(5000).fadeOut(5000);
					 	
					 }, 6000);
					 $("#afs-text").hide();					
				    
					console.log(" --> audio being captured");
					micStream = stream;
					console.log(micStream);
					var src = window.URL.createObjectURL(micStream);
		 			root.source = context.createMediaStreamSource(micStream)
					source.connect(analyser);
					analyser.connect(context.destination);	
					audio.pause();					
					//audio.src = null;
				}, h.microphoneError);

			} else {
			  // fallback.
			}
		}
		else {
			console.log(" --> turning off")
			micStream.stop();
			micStream = null;
			audio.play();
		}

		};
	
	
	root.App = a;

	// manipulating/normalizing waveform data ///////////////////////////////////////////////////////
	var c = {}; 
	c.kickDetect = function(threshold) {
		var kick = false;

		var deltas = $(waveform_array).each(function(n,i) {
			if (!old_waveform) return 0;
			else return old_waveform[i]-n;
		});
		var s = d3.sum(deltas)/1024;

		if (s>threshold && State.canKick) {
			kick = true;
			State.canKick = false;
	        setTimeout(function(){
	            State.canKick = true;
	        }, 5000);
		}

		root.old_waveform = waveform_array;

		return kick;
		};
	c.normalize = function(coef, offset, neg) {

		//https://stackoverflow.com/questions/13368046/how-to-normalize-a-list-of-positive-numbers-in-javascript

		var coef = coef || 1;
		var offset = offset || 0;
		var numbers = waveform_array;
		var numbers2 = [];
		var ratio = Math.max.apply( Math, numbers );
		var l = numbers.length

		for (var i = 0; i < l; i++ ) {
			if (numbers[i] == 0)
				numbers2[i] = 0 + offset;
			else
				numbers2[i] = ((numbers[i]/ratio) * coef) + offset;

			if (i%2 == 0 && neg)
				numbers2[i] = -Math.abs(numbers2[i]);
		}
		return numbers2;
		
		};
	c.normalize_binned = function(binsize, coef, offset, neg) {

		var numbers = [];
		var temp = 0;
	 	for (var i = 0; i < waveform_array.length; i++) {
	 		temp += waveform_array[i];
	    	if (i%binsize==0) {
	    		numbers.push(temp/binsize);
	    		temp = 0;
	    	}
	  	}

		var coef = coef || 1;
		var offset = offset || 0;
		var numbers2 = [];
		var ratio = Math.max.apply( Math, numbers );
		var l = numbers.length

		for (var i = 0; i < l; i++ ) {
			if (numbers[i] == 0)
				numbers2[i] = 0 + offset;
			else
				numbers2[i] = ((numbers[i]/ratio) * coef) + offset;

			if (i%2 == 0 && neg)
				numbers2[i] = -Math.abs(numbers2[i]);
		}
		return numbers2;
		
		};
	c.total = function() { return Math.floor(d3.sum(waveform_array)/waveform_array.length); };
	c.total_normalized = function() {};
	c.bins_select = function(binsize) {
		var copy = [];
	 	for (var i = 0; i < 500; i++) {
	    	if (i%binsize==0)
	    		copy.push(waveform_array[i]);
	  	}
	  	return copy;
		};
	c.bins_avg = function(binsize) {
		var binsize = binsize || 100;
		var copy = [];
		var temp = 0;
	 	for (var i = 0; i < waveform_array.length; i++) {
	 		temp += waveform_array[i];
	    	if (i%binsize==0) {
	    		copy.push(temp/binsize);
	    		temp = 0;
	    	}
	  	}
	  	//console.log(copy);
	  	return copy;
		};	
	root.Compute = c;

	

	// helper methods ///////////////////////////////////////////////////////////////////////////////
	var h = {};
	h.toggleMenu = function(x) {
		console.log('h.toggleMenu');

		if (x == 'toggle')
			x = ($('.menu').hasClass('menu-open')) ? 'close' : 'open';

		if (x == 'open') {
			$('.menu').addClass('menu-open');
			$('.icon-menu').addClass('fadeOut');
			//$("body > svg").attr("class", "svg-open");
		}
		else {
			$('.menu').removeClass('menu-open');
			//$("body > svg").attr("class", "svg-closed");
		}

		};
	h.toggleFullScreen = function() {
		console.log("h.toggleFullScreen fired");

		// thanks mdn

		if (!document.fullscreenElement &&    // alternative standard method
		  !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {  // current working methods

		  	$('.icon-expand').addClass('icon-contract');
			if (document.documentElement.requestFullscreen) {
				document.documentElement.requestFullscreen();
			} else if (document.documentElement.msRequestFullscreen) {
				document.documentElement.msRequestFullscreen();
			} else if (document.documentElement.mozRequestFullScreen) {
				document.documentElement.mozRequestFullScreen();
			} else if (document.documentElement.webkitRequestFullscreen) {
				document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
			}
		} else {
		  	$('.icon-expand').removeClass('icon-contract');
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen();
			} else if (document.mozCancelFullScreen) {
				document.mozCancelFullScreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			}
		}
		}
	h.hideHUD = function() {
		//$('.icon-knobs').is(':hover') || 
		if ($('#mp3_player').is(':hover') || $('.dotstyle').is(':hover') || $('.slider').is(':hover') || $('.icon-expand').is(':hover') || $('.icon-github2').is(':hover') || $('.icon-loop-on').is(':hover') || $('.icon-question').is(':hover') || $('.icon-keyboard2').is(':hover') || $('.song-metadata').is(':hover') || $('.icon-forward2').is(':hover') || $('.icon-backward2').is(':hover') || $('.icon-pause').is(':hover') || $('.schover').is(':hover'))
			return;

		$('#mp3_player').addClass('fadeOut');
		$('.icon-menu').addClass('fadeOut');
		$('.menu-wide').addClass('fadeOut');
		$('.menu').addClass('fadeOut');
		$('.menu-controls').addClass('fadeOut');
		$('#progressBar').addClass('fadeOut');
		$('html').addClass('noCursor');
		if (State.metaLock == false)
			$('.song-metadata').removeClass("show-meta");

		State.hud = 0;
		}
	h.showHUD = function() {

		$('#mp3_player').removeClass('fadeOut');
		$('.icon-menu').removeClass('fadeOut');
		$('.menu-wide').removeClass('fadeOut');
		$('.menu').removeClass('fadeOut');
		$('.menu-controls').removeClass('fadeOut');
		$('#progressBar').removeClass('fadeOut');
		$('html').removeClass('noCursor');
		$('.song-metadata').addClass("show-meta");

		State.hud = 1;

		}
	h.showModal = function(id) {
		if ($(id).hasClass('md-show')) {
			h.hideModals();
			return;
		}

		if ($('.md-show').length > 0) {
			h.hideModals();
		}

		$(id).addClass('md-show');
		
		};
	h.hideModals = function() {
		$('.md-modal').removeClass('md-show');
		};

	h.resize = function() {
		console.log('h.resize fired');		
	    State.width = $(window).width();
		State.height = $(window).height();
		State.active = State.trigger;
		$('body > svg').attr("width", State.width).attr("height", State.height);

		var full = document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen;
		if (!full) $('.icon-expand').removeClass('icon-contract');

		};
	h.stop = function(e) {
	    e.stopPropagation();
	    e.preventDefault();
		};
	h.handleDrop = function(e) {
		console.log('h.handleDrop fired');

		h.stop(e);
		h.removeSoundCloud();
		//if (window.File && window.FileReader && window.FileList && window.Blob) {

    	URL.revokeObjectURL(objectUrl);		
    	var file = e.originalEvent.dataTransfer.files[0];

		if (!file.type.match(/audio.*/)) {
			console.log("not audio file");
			return;
		}

    	h.readID3(file);

    	var objectUrl = URL.createObjectURL(file);
    	a.loadSoundHTML5(objectUrl);
			 
		};
	h.readID3 = function(file) {
		console.log('h.readID3 fired');

		$('.song-metadata').html("");

		if (typeof file == 'string') {

			ID3.loadTags(audio.src, function() {
			    var tags = ID3.getAllTags(audio.src);
				h.renderSongTitle(tags);
			});

		}

		else {

			ID3.loadTags(file.urn || file.name, function() {
			    var tags = ID3.getAllTags(file.urn || file.name);
			    tags.dragged = true;
				h.renderSongTitle(tags);

			    if( "picture" in tags ) {
			    	var image = tags.picture;
			    	var base64String = "";
			    	for (var i = 0; i < image.data.length; i++) {
			    		base64String += String.fromCharCode(image.data[i]);
			    	}
			    	//console.log("data:" + image.format + ";base64," + window.btoa(base64String));
			    	//$("art").src = "data:" + image.format + ";base64," + window.btoa(base64String);
			    	//$("art").style.display = "block";
			    } 
			    else {
			    	//console.log("nope.");
			    	//$("art").style.display = "none";
			    }
			}, {
			    dataReader: FileAPIReader(file)
			});
		}

		};

	h.removeSoundCloud = function() {
		State.soundCloudURL = null;
		State.soundCloudData = null;
		State.soundCloudTracks = null;

		$('.song-metadata').html("");
		$('.song-metadata').attr('data-go', "");

		$('#sc_input').val("");
		$('#sc_url span').html('SOUNDCLOUD_URL');

		// load local songs?

		};

	h.togglePlay = function() {
		(audio && audio.paused == false) ? audio.pause() : audio.play();
		$('.icon-pause').toggleClass('icon-play');
		};
	h.songEnded = function() {
		console.log('h.songEnded fired');		

		h.changeSong('n');

		};
	h.changeSong = function(direction) {
		console.log('h.changeSong fired');		

		var totalTracks = State.soundCloudTracks || State.playlist.length;

		if (State.soundCloudData && State.soundCloudTracks <= 1) {
			audio.currentTime = 0;
			$('.icon-pause').removeClass('icon-play');
			return;
		}

		if (direction == 'n')
			State.currentSong = State.currentSong + 1;

		else if (direction == 'p') {
			if (audio.currentTime < 3) {
				State.currentSong = (State.currentSong <= 0) ? State.currentSong+totalTracks-1 : State.currentSong - 1;
			}
			else {
				audio.currentTime = 0;
				$('.icon-pause').removeClass('icon-play');
				return;
			}
		}
		else {
			State.currentSong = Math.floor(Math.random() * totalTracks);
		}

		if (State.soundCloudData) {
			var trackNum = Math.abs(State.currentSong)%State.soundCloudTracks;
			h.renderSongTitle(State.soundCloudData[trackNum]);
			a.loadSoundHTML5(State.soundCloudData[trackNum].uri+'/stream?client_id=67129366c767d009ecc75cec10fa3d0f');
		}
		else {
			if (audio) {
				audio.src = 'mp3/'+State.playlist[Math.abs(State.currentSong)%State.playlist.length];
				h.readID3(audio.src);
			}
		}

		$('.icon-pause').removeClass('icon-play');

		};
	h.renderSongTitle = function(obj) {
		console.log('h.renderSongTitle fired');		

		if (State.soundCloudData) {
			var trackNum = Math.abs(State.currentSong)%State.soundCloudTracks;
			var regs = new RegExp(obj.user.username, 'gi');
			var prettyTitle = obj.title;

			if (prettyTitle.search(regs) == -1)
				prettyTitle += ' <b>' + obj.user.username + '</b>'; 

			//var prettyTitle = obj.title.replace(regs, "<b>"+obj.user.username+"</b>");
			
			if (State.soundCloudTracks > 1)
				prettyTitle += ' ['+(trackNum+1)+'/'+State.soundCloudTracks+']';

			$('.song-metadata').html(prettyTitle);
			$('.song-metadata').attr('data-go', obj.permalink_url);
		}
		else {
			// id3?
		    var prettyTitle = '"'+obj.title+'" by <b>'+obj.artist+'</b>'; //  on <i>'+tags.album+'</i>
			var trackNum = Math.abs(State.currentSong)%State.playlist.length;

			if (State.playlist.length > 1 && !obj.dragged)
				prettyTitle += ' ['+(trackNum+1)+'/'+State.playlist.length+']';

			$('.song-metadata').html(prettyTitle);
			$('.song-metadata').attr('data-go', State.playListLinks[trackNum]);
		}

			$('.song-metadata').addClass("show-meta");

			State.metaLock = true;
			clearTimeout(metaHide);
			// in 3 seconds, remove class unless lock
			metaHide = setTimeout(function() { 
				State.metaLock = false;
				if (State.hud == 0)
					$('.song-metadata').removeClass("show-meta");
			}, 3000);

		};
	h.tooltipReplace = function() {
		console.log('h.tooltipReplace fired');

		var text = $(this).attr('data-hovertext');
		console.log(text);
		if (text != null) {
			State.hoverTemp = $('.song-metadata').html();
			$('.song-metadata').html(text);
		}
	
		};
	h.tooltipUnReplace = function() {
		console.log('h.tooltipUnReplace fired');
		
		if (State.hoverTemp != null) {
			$('.song-metadata').html(State.hoverTemp);
			State.hoverTemp = null;
		}

		};
	h.songGo = function() {
		console.log('h.songGo fired.');

		if (!$(this).attr('data-go'))
			return false;
		audio.pause();
		$('.icon-pause').removeClass('icon-play');
		window.open($(this).attr('data-go'),'_blank');
		
		};

	h.themeChange = function(n) {
		n = +n;
		n  = (n<0) ? 5 : n;
		n  = (n>5) ? 0 : n;
		State.theme = n;

		console.log('h.themeChange:'+n);
		var name = 'theme_'+n;
		$('html').attr('class',name); 

		$('.dotstyle li.current').removeClass('current');
		$('.dotstyle li:eq('+n+')').addClass('current');

		};
	h.vizChange = function(n) {
		n  = (n<0) ? 6 : n;
		n  = (n>6) ? 0 : n;

		console.log('h.vizChange:'+n);
		State.trigger = n;
		$('.menu li.active').removeClass('active');
		$('.menu li[viz-num="'+n+'"]').addClass('active');

		};
	h.infiniteChange = function(toggle) {
		console.log('h.infiniteChange fired: '+toggle);

		clearInterval(State.changeInterval);

		State.changeInterval = setInterval(function(){
	    	h.themeChange(Math.floor(Math.random() * 6));
	    	h.vizChange(Math.floor(Math.random() * 8));
		},toggle);

		if (toggle == null)
			clearInterval(State.changeInterval);

		};

	h.icosahedronFaces = function(slide) {
		var slide = slide || 180;
		var faces = [],
		  y = Math.atan2(1, 2) * slide / Math.PI;
		for (var x = 0; x < 360; x += 72) {
		faces.push(
		  [[x +  0, -90], [x +  0,  -y], [x + 72,  -y]],
		  [[x + 36,   y], [x + 72,  -y], [x +  0,  -y]],
		  [[x + 36,   y], [x +  0,  -y], [x - 36,   y]],
		  [[x + 36,   y], [x - 36,   y], [x - 36,  90]]
		);
		}
		return faces;
		};
	h.degreesToRads = function(n) {
        return d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI])(this);
    	};

	h.microphoneError = function(e) {
		// user clicked not to let microphone be used
		console.log(e);
		};
    h.getURLParameter = function(sParam) {
    	//http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
	    var sPageURL = window.location.search.substring(1);
	    var sURLVariables = sPageURL.split('&');
	    for (var i = 0; i < sURLVariables.length; i++) {
	        var sParameterName = sURLVariables[i].split('=');
	        if (sParameterName[0] == sParam) {
	            return sParameterName[1];
	        }
	    }
		};
	h.isMobile = function() {
		// returns true if user agent is a mobile device
		return (/iPhone|iPod|iPad|Android|BlackBerry/).test(navigator.userAgent);
		};
	h.detectEnvironment = function() {
		if (window.location.protocol.search('chrome-extension') >= 0)
			return 'chrome-extension';

		if (navigator.userAgent.search("Safari") >= 0 && navigator.userAgent.search("Chrome") < 0)
			return 'safari';

		//  https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
		
		if (!!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0)
			return 'opera';

		if (typeof InstallTrigger !== 'undefined')
			return 'firefox';

		// var isChrome = !!window.chrome && !isOpera;              // Chrome 1+
		// var isIE = /*@cc_on!@*/false || !!document.documentMode; // At least IE6

		return 'unknown';

		};
	h.getCookie = function(c_name) {
		//console.log("h.getCookie fired");
		var i,x,y,ARRcookies=document.cookie.split(";");
		for (i=0;i<ARRcookies.length;i++) {
		  x=ARRcookies[i].substr(0,ARRcookies[i].indexOf("="));
		  y=ARRcookies[i].substr(ARRcookies[i].indexOf("=")+1);
		  x=x.replace(/^\s+|\s+$/g,"");
		  if (x==c_name) {
		    return unescape(y);
		  }
		}
		};
	h.setCookie = function(c_name,value,exdays) {
		//console.log("h.setCookie fired");
		var exdate=new Date();
		exdate.setDate(exdate.getDate() + exdays);
		var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
		document.cookie=c_name + "=" + c_value;
		};
	h.prettyLog = function(data) {
		console.log("h.prettyLog fired");
		return false;
		
		var x = data || localStorage.account;
		if (typeof x == 'object') x = JSON.stringify(x);
		if (typeof data == "undefined") return;
		if (typeof data == "string") {
			console.log(data);
			return;
		}
		console.log('\n'+JSON.stringify(JSON.parse(x),null, 4));
		};
	h.applyStyles = function(selector, styleToApply){
		if(typeof selector == undefined) return;
		if(typeof styleToApply == undefined) return;

		var style = '';
		for (var i = 0; i < State.vendors.length; i++) {
			style += State.vendors[i]+ styleToApply;
		}
		$(selector).attr("style", style);
		};
	root.Helper = h;

}).call(this);

$(document).ready(App.init);

