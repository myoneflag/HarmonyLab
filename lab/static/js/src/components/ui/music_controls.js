define([
	'jquery', 
	'lodash', 
	'app/config',
	'app/components/events',
	'app/components/component',
	'app/components/ui/modal',
	'app/utils/instruments',
	'app/widgets/key_signature',
	'app/widgets/analyze',
	'app/widgets/highlight'
], function(
	$, 
	_, 
	Config, 
	EVENTS,
	Component,
	ModalComponent,
	Instruments,
	KeySignatureWidget,
	AnalyzeWidget,
	HighlightWidget
) {
	
	/**
	 * Defines the title of the app info modal.
	 * @type {string}
	 * @const
	 */
	var APP_INFO_TITLE = Config.get('helpText.appInfo.title');
	/**
	 * Defines the content of the app info modal.
	 * @type {string}
	 * @const
	 */
	var APP_INFO_CONTENT = Config.get('helpText.appInfo.content');
	/**
	 * Defines whether the shortcuts are enabled by default or not.
	 * @type {boolean}
	 * @const
	 */
	var KEYBOARD_SHORTCUTS_ENABLED = Config.get('general.keyboardShortcutsEnabled');
	/**
	 * Defines the default keyboard size.
	 * @type {number}
	 * @const
	 */
	var DEFAULT_KEYBOARD_SIZE = Config.get('general.defaultKeyboardSize');

	/**
	 * Defines a namespace for settings.
	 * canvas.
	 *
	 * @namespace
	 */
	var MusicControlsComponent = function(settings) {
		this.settings = settings || {};
		if(!("keySignature" in settings)) {
			throw new Error("missing keySignature setting");
		}
		if(!("midiDevice" in settings)) {
			throw new Error("missing midiDevice setting");
		}
		this.keySignature = settings.keySignature;
		this.midiDevice = settings.midiDevice;

		if(settings.exerciseContext) { 
			this.exerciseContext = settings.exerciseContext;
		} else {
			this.exerciseContext = false;
		}

		this.addComponent(new ModalComponent());
		
		this.headerEl = $(settings.headerEl);
		this.containerEl = $(settings.containerEl);

		_.bindAll(this, ['onClickInfo']);
	};

	MusicControlsComponent.prototype = new Component();

	_.extend(MusicControlsComponent.prototype, {
		/**
		 * Initializes the component.
		 *
		 * @return undefined
		 */
		initComponent: function() {

			$('.js-btn-help', this.headerEl).on('click', this.onClickInfo);
			$('.js-btn-screenshot').on('mousedown', this.onClickScreenshot);
			$('.js-btn-upload-json').on('mousedown', () => this.onClickSaveJSON("upload"));
			$('.js-btn-download-json').on('mousedown', () => this.onClickSaveJSON());
			$('.js-btn-pristine').on('mousedown', () => this.onClickPristine());

			this.initControlsLayout();
			this.initKeySignatureTab();
			this.initNotationTab();
			this.renderInstrumentSelect();
			this.renderKeyboardSizeSelect();
			this.renderOctaveAdjustment();
			this.renderKeyboardShortcuts();
			this.initMidiTab();
		},
		/**
		 * Initializes the controls layout. 
		 * 
		 * @return undefined
		 */
		initControlsLayout: function() {
			this.containerEl.children(".accordion").accordion({
				active: false,
				collapsible: true,
				heightStyle: "content"
			});
		},
		/**
		 * Initializes the content of the midi.
		 *
		 * @return undefined
		 */
		initMidiTab: function() {
			var containerEl = this.containerEl;
			var renderDevices = function(midiDevice) {
				var inputs = midiDevice.getInputs();
				var outputs = midiDevice.getOutputs();
				var tpl = _.template('<option value="<%= id %>"><%= name %></option>');
				var makeOptions = function(device, idx) {
					return tpl({ id: idx, name: device.name });
				};
				var devices = {
					'input': {
						'selector': $('.js-select-midi-input', containerEl),
						'options': _.map(inputs, makeOptions)
					},
					'output': {
						'selector': $('.js-select-midi-output', containerEl),
						'options': _.map(outputs, makeOptions) }
				};

				_.each(devices, function(device, type) {
					if(device.options.length > 0) {
						$(device.selector).html(device.options.join(''));
					} else {
						$(device.selector).html('<option>--</option>');
					}

					if(device.readonly) {
						$(device.selector).attr('disabled', 'disabled');
					} else {
						$(device.selector).on('change', function() {
							var index = parseInt($(this).val(), 10);
							var inputs = this.length; /* this is the number of available devices */
							midiDevice[type=='input'?'selectInput':'selectOutput'](index, inputs);
						});
					}
				});

			};

			$('.js-refresh-midi-devices', containerEl).on('click', this.midiDevice.update);

			this.midiDevice.bind("updated", renderDevices);

			renderDevices(this.midiDevice);
		},
		/**
		 * Initializes the content of the key signature.
		 *
		 * @return undefined
		 */
		initKeySignatureTab: function() {
			var containerEl = this.headerEl;
			var el = $('.js-keysignature-widget', containerEl); 
			var widget = new KeySignatureWidget(this.keySignature);
			widget.render();
			el.append(widget.el);
		},
		/**
		 * Initializes the content of the notation containerEl.
		 *
		 * @return undefined
		 */
		initNotationTab: function() {
			var that = this;
			var containerEl = this.containerEl;
			var el = $('.js-analyze-widget', containerEl);
			var analysisSettings = {};
			var highlightSettings = {};
			var staffDistribution = {};
			if(this.exerciseContext) {
				/* TO DO: grab additional settings */
				analysisSettings = this.exerciseContext.getDefinition().getAnalysisSettings();
				highlightSettings = this.exerciseContext.getDefinition().getHighlightSettings();
				staffDistribution = this.exerciseContext.getDefinition().getStaffDistribution();
			}
			var analyze_widget = new AnalyzeWidget(analysisSettings);
			var highlight_widget = new HighlightWidget(highlightSettings);
			var event_for = {
				'highlight': EVENTS.BROADCAST.HIGHLIGHT_NOTES,
				'analyze': EVENTS.BROADCAST.ANALYZE_NOTES
			};
			var onChangeCategory = function(category, enabled) {
				if(event_for[category]) {
					that.broadcast(event_for[category], {key: "enabled", value: enabled});
				}
			};
			var onChangeOption = function(category, mode, enabled) {
				var value = {};
				if(event_for[category]) {
					value[mode] = enabled;
					that.broadcast(event_for[category], {key: "mode", value: value});
				}
			};

			highlight_widget.bind('changeCategory', onChangeCategory);
			highlight_widget.bind('changeOption', onChangeOption);

			analyze_widget.bind('changeCategory', onChangeCategory);
			analyze_widget.bind('changeOption', onChangeOption);

			analyze_widget.render();
			highlight_widget.render();

			el.append(analyze_widget.el, highlight_widget.el);
		},
		/**
		 * Renders the instrument selector.
		 *
		 * @return undefined
		 */
		renderInstrumentSelect: function() {
			var that = this;
			var containerEl = this.containerEl;
			var el = $('.js-instrument', containerEl);
			var selectEl = $("<select/>");
			var tpl = _.template('<% _.forEach(instruments, function(inst) { %><option value="<%= inst.num %>"><%- inst.name %></option><% }); %>');
			var options = tpl({ instruments: Instruments.getEnabled() });

			selectEl.append(options);
			selectEl.on('change', function() {
				var instrument_num = $(this).val();
				that.broadcast(EVENTS.BROADCAST.INSTRUMENT, instrument_num);
			});
			
			el.append(selectEl);
		},
		/**
		 * Renders the keyboard size selector.
		 *
		 * @return undefined
		 */
		renderKeyboardSizeSelect: function() {
			var that = this;
			var containerEl = this.containerEl;
			var el = $('.js-keyboardsize', containerEl);
			var selectEl = $("<select/>");
			var tpl = _.template('<% _.forEach(sizes, function(size) { %><option value="<%= size %>"><%- size %></option><% }); %>');
			var options = tpl({sizes: [25,32,37,49,88]})
			var selected = DEFAULT_KEYBOARD_SIZE;

			selectEl.append(options);
			selectEl.find("[value="+selected+"]").attr("selected", "selected");
			selectEl.on('change', function() {
				var size = parseInt($(this).val(), 10);
				that.broadcast(EVENTS.BROADCAST.KEYBOARD_SIZE, size);
			});

			el.append(selectEl).wrapInner("<label>Piano keys&ensp;</label>");
		},
		/**
		 * Renders the octave adjustment selector.
		 *
		 * @return undefined
		 */
		renderOctaveAdjustment: function() {
			var that = this;
			var containerEl = this.containerEl;
			var el = $('.js-octaveadjustment', containerEl);
			var selectEl = $("<select/>");
			var tpl = _.template('<% _.forEach(adjustments, function(adj) { %><option value="<%= adj %>"><%- adj %></option><% }); %>');
			var options = tpl({adjustments: [-2,-1,0,1,2]})
			var selected = 0;

			selectEl.append(options);
			selectEl.find("[value="+selected+"]").attr("selected", "selected");
			selectEl.on('change', function() {
				var adj = parseInt($(this).val(), 10);
				that.broadcast(EVENTS.BROADCAST.OCTAVE_ADJUSTMENT, adj);
			});

			el.append(selectEl).wrapInner("<label>Octave adjustment&ensp;</label>");
		},
		/**
		 * Renders the keyboard shorcuts.
		 *
		 * @return undefined
		 */
		renderKeyboardShortcuts: function() {
			var that = this;
			var containerEl = this.containerEl;
			var el = $('.js-keyboardshortcuts', containerEl);
			var inputEl = $('<input type="checkbox" name="keyboard_shortcuts" value="on" />');
			el.append("Computer keyboard as piano&ensp;").append(inputEl).wrap("<label/>");

			// toggle shortcuts on/off via gui control
			inputEl.attr('checked', KEYBOARD_SHORTCUTS_ENABLED);
			inputEl.on('change', function() {
				var toggle = $(this).is(':checked') ? true : false;
				that.broadcast(EVENTS.BROADCAST.TOGGLE_SHORTCUTS, toggle);
				$(this).blur(); // trigger blur so it loses focus
			});

			// update gui control when toggled via ESC key
			this.subscribe(EVENTS.BROADCAST.TOGGLE_SHORTCUTS, function(enabled) {
				inputEl[0].checked = enabled;
			});
		},
		/**
		 * Handler to generate a screenshot/image of the staff area.
		 *
		 * @param {object} evt
		 * @return {boolean} true
		 */
		onClickScreenshot: function(evt) {
			var $canvas = $('#staff-area canvas');
			var $target = $(evt.target);
			var data_url = $canvas[0].toDataURL();
			$target[0].href = data_url;
			$target[0].target = '_blank';
			return true;
		},
		/**
		 * Handler to upload or download JSON data for the current notation.
		 *
		 * @param {string} destination
		 * @return {boolean} true
		 */
		onClickSaveJSON: function(destination="download") {
			advanced = true;

			var json_data = JSON.parse(sessionStorage.getItem('current_state')) || false;
			if (!json_data /* || json_data["chords"].length < 1 */) {
				console.log("Cannot find JSON data");
				return false;
			}

			if (advanced) {
				const type_input = prompt("Enter a number for exercise type: (1) matching (2) analytical (3) analytical_pcs (4) figured_bass (5) figured_bass_pcs");
				const type_options = {
					"1": "matching",
					"2": "analytical",
					"3": "analytical_pcs",
					"4": "figured_bass",
					"5": "figured_bass_pcs"
				}
				const type = (type_input ? (type_options.hasOwnProperty(type_input) ? type_options[type_input] : false) : false);

				const user_input = prompt("Enter the Intro Text");
				const intro_text =  (!user_input ? false :
					user_input
					.replace(/[^-\w\.:;,!?/&*()[\] '"]+/g, '')
					.replace(/^\"/g, '“')
					.replace(/ \"/g, ' “')
					.replace(/^\'/g, '‘')
					.replace(/ \'/g, ' ‘')
					.replace(/\"$/g, '”')
					.replace(/\" /g, '” ')
					.replace(/\'$/g, '’')
					.replace(/\' /g, '’ ')
					.replace(/\'(s)\b/g, '’$1')
					.replace(/-{3}/g, '—')
					.replace(/-{2}/g, '–')
				);
				// do not allow < > until these field is verified as good html

				if (intro_text) {
					json_data.introText = intro_text;
				}
				if (type) {
					json_data.type = type;
				}
			}

			var intro_text = json_data.introText;
			json_data = JSON.stringify(json_data,null,0);

			if (destination === "upload") {
				console.log("Upload", json_data);

				$.ajax({
					type: "POST",
					url: 'exercises/add',
					data: {'data': json_data},
					dataType: 'json',
					success: function (data) {
						let exerciseID = data.id;
						window.alert('Exercise uploaded! Exercise ID: ' + exerciseID);
					}
				});

			} else {
				console.log("Download", json_data);
				var file_name = "exercise_download";
				if (advanced) {
					let probe = intro_text
						.replace(/[^-\w ]+/g, '')
						.replace(/ +/g, '_').slice(0,30);
					if (probe && probe.length >= 1 && typeof probe === "string") {
						file_name = probe;
					}
				}

				var blob = new Blob([json_data], {type: "application/json;charset=utf-8"});
				saveAs(blob, file_name + ".json");
			}

			return true;
		},
		/**
		 * Handler to broadcast request for pristine sheet music div.
		 *
		 * @param {object} evt
		 * @return {boolean} true
		 */
		onClickPristine: function() {
			this.broadcast(EVENTS.BROADCAST.PRISTINE);
			return true;
		},
		/**
		 * Handler to shows the info modal.
		 *
		 * @param {object} evt
		 * @return {boolean} false
		 */
		onClickInfo: function(evt) {
			this.trigger("modal", {title: APP_INFO_TITLE, content: APP_INFO_CONTENT});
			return false;
		}
	});

	return MusicControlsComponent;
});
