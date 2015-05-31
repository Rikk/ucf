/*
 * Unicode Character Finder
 * Copyright (c) 2010-2015 Grant McLean <grant@mclean.net.nz>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function($) {

    "use strict";


    /* Utility Functions
     * ================= */

    function dec2hex(dec, len) {
        var hex = dec.toString(16).toUpperCase();
        while (hex.length < len) { hex = "0" + hex; }
        return hex;
    }

    function hex2dec(hex) {
        return parseInt(hex, 16);
    }

    function codepoint_to_string(i) {
        if(i < 65536) {
            return String.fromCharCode(i);
        }
        var hi = Math.floor((i - 0x10000) / 0x400) + 0xD800;
        var lo = ((i - 0x10000) % 0x400) + 0xDC00;
        return String.fromCharCode(hi) + String.fromCharCode(lo);
    }

    function string_to_codepoint(str) {
        var hi = str.charCodeAt(0);
        if((hi & 0xF800) != 0xD800) {
            return hi;
        }
        var lo = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
    }

    function dec2utf8(dec) {
        if(dec < 0x80) {
            return dec2hex(dec,2);
        }
        if(dec < 0x800) {
            return dec2hex(0xC0 | (dec >> 6), 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        if(dec < 0x10000) {
            return dec2hex(0xE0 | (dec >> 12), 2) + " "
                + dec2hex(0x80 | ((dec >> 6)) & 0x3F, 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        if(dec < 0x110000) {
            return dec2hex(0xF0 | (dec >> 18), 2) + " "
                + dec2hex(0x80 | ((dec >> 12) & 0x3F), 2) + " "
                + dec2hex(0x80 | ((dec >> 6) & 0x3F), 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        return "unknown";
    }

    function dec2utf16(dec) {
        if(dec < 0x10000) {
            return dec2hex(dec, 4);
        }
        if (dec < 0x110000) {
            dec = dec - 0x10000;
            return dec2hex(0xD800 | (dec >> 10), 4) + " "
                + dec2hex(0xDC00 | (dec & 0x3FF), 4);
        }
        return "unknown";
    }


    /* UnicodeCharacterFinder Class Definition
     * ======================================= */

    var UnicodeCharacterFinder = function (el, options) {
        this.$el = $(el);
        this.opt = options;
        this.build_ui();
    }

    UnicodeCharacterFinder.prototype = {
        code_chart:   { },
        code_list:    [ ],
        code_blocks:  [ ],
        html_ent:     { },
        html_name:    { },
        unique_ids:   [ ],

        build_ui: function () {
            this.$el.hide();
            this.start_loading_splash();

            this.load_unicode_data( this.enable_ui ); // callback when done

            this.add_font_dialog();
            this.add_help_dialog();
            this.add_code_chart_dialog();
            this.add_form_elements();
            this.add_sample_chars();
            this.$el.append(this.$form);
        },

        start_loading_splash: function () {
            var $div = $('<div class="ucf-splash-dlg"/>');
            this.$splash_dialog = $div;
            $div.append('<p class="ucf-loading">Please wait &#8230; </p>');
            $div.dialog({
                autoOpen:      true,
                title:         "Loading",
                resizable:     false,
                closeOnEscape: false,
                modal:         true,
                width:         350,
                height:        150
            });
            $div.ajaxError(function(event, req, settings, error) {
                $div.html(
                    '<p class="error">'
                    + '<span class="ui-icon ui-icon-alert"></span>'
                    + 'Failed to load Unicode character data.</p>'
                    + '<p>Have you run <code>make-data-file</code>?</p>'
                );
            });
        },

        enable_ui: function () {
            var app = this;
            this.populate_code_blocks_menu();
            this.$splash_dialog.dialog('close');
            this.$el.slideDown(600, function() {
                app.$search_input.focus();
            });
            this.set_preview_char('');
            this.process_querystring();
        },

        process_querystring: function () {
            var args = jQuery.deparam(jQuery.param.querystring());
            // c=U+XXXX
            if(args.c && args.c.match(/^U[ +]([0-9A-Fa-f]{4,7})$/)) {
                this.set_preview_char(codepoint_to_string( hex2dec(RegExp.$1) ) );
            }
            // c=999
            else if(args.c && args.c.match(/^(\d+){1,9}$/)) {
                this.set_preview_char(codepoint_to_string( parseInt(RegExp.$1, 10) ) );
            }
            // c=uXXXXuXXXX
            else if(args.c && args.c.match(/^u([0-9A-Fa-f]{4})u([0-9A-Fa-f]{4})$/)) {
                var str = String.fromCharCode( hex2dec(RegExp.$1) )
                        + String.fromCharCode( hex2dec(RegExp.$2) );
                this.set_preview_char(str );
            }
            // q=????
            else if(args.q) {
                this.$search_input.val(args.q).autocomplete('search');
            }
        },

        set_preview_char: function (new_char) {
            var inp = $('input.char');
            inp.val(new_char);
            this.char_changed(inp);
        },

        add_font_dialog: function () {
            var app = this;
            var $font_tab = $('<div class="ucf-tab-font" />');
            this.$el.append($font_tab);

            var $div = $('<div class="ucf-font-menu" />');
            this.$font_dialog = $div;
            $div.attr('id', this.$el.data('font_dlg_id'));
            var $inp = $('<input type="text" class="ucf-font" />')
                .css({'width': '180px'});;
            $div.append(
                $('<p>Font name</p>'),
                $inp
            );

            $div.dialog({
                autoOpen:      false,
                title:         "Font Selection",
                resizable:     false,
                closeOnEscape: true,
                width:         220,
                height:        160,
                buttons:       {
                    "Save":  function() {
                        app.save_font($inp.val());
                        $div.dialog("close");
                    },
                    "Cancel": function() { $(this).dialog("close"); }
                }
            });

            $font_tab.click(function() { $div.dialog('open'); });
        },

        add_help_dialog: function () {
            var sel = this.opt.help_selector;
            if(sel) {
                var $div = $(sel);
                if($div.length > 0) {
                    var $help_tab = $('<div class="ucf-tab-help" />');
                    $div.dialog({
                        autoOpen:      false,
                        title:         "Using the Unicode Character Finder",
                        resizable:     true,
                        closeOnEscape: true,
                        modal:         true,
                        width:         600,
                        height:        400,
                        buttons:       {
                            "Close": function() { $(this).dialog("close"); }
                        }
                    });
                    $help_tab.click(function() { $div.dialog('open'); });
                    this.$el.append($help_tab);
                }
            }
        },

        char_search_field: function () {
            this.$search_wrapper = $('<div class="search-wrap empty" />')
                .append(
                    $('<label />').text('Search character descriptions:'),
                    this.build_search_link(),
                    this.build_search_input()
                );
            this.init_search_input();
            return this.$search_wrapper;
        },

        build_search_link: function () {
            var app = this;
            return this.$search_link =
                $('<a class="search-link" title="Link to this search" />')
                    .html('&#167;')
                    .keyup(function() { app.set_search_link(); })
                    .blur( function() { app.set_search_link(); });
        },

        build_search_input: function () {
            return this.$search_input = $('<input type="text" class="search" />')
        },

        init_search_input: function () {
            var app = this;
            this.$search_input.autocomplete({
                delay: 900,
                minLength: 1,
                source: function(request, response) {
                    var target = request.term;
                    app.set_search_link();
                    if(target != '') {
                        var search_method = 'execute_search';
                        if(target.charAt(0) == '/') {
                            if(target.length < 3 || target.charAt(target.length - 1) != '/') {
                                return;
                            }
                            target = target.substr(1, target.length - 2);
                            search_method = 'execute_regex_search';
                        }
                        app.$search_input.addClass('busy');
                        setTimeout(function() {
                            app[search_method](target, response);
                        }, 2 );
                    }
                },
                open: function(e, ui) {
                    app.$search_input.removeClass('busy');
                },
                focus: function(e, ui) {
                    return false;
                },
                select: function(e, ui) {
                    app.set_preview_char(ui.item.character);
                    window.scrollTo(0,0);
                    return false;
                }
            });
        },

        set_search_link: function () {
            var str = this.$search_input.val();
            if(str.length == 0) {
                this.$search_wrapper.addClass('empty');
            }
            else {
                this.$search_wrapper.removeClass('empty');
                var link = jQuery.param.querystring('?', { q: str });
                this.$search_link.attr('href', link);
            }
        },

        add_form_elements: function () {
            this.$form = $('<form class="ucf-app empty" />').append(
                this.char_info_pane(),
                this.char_search_field()
            ).submit(function(event) {
                event.preventDefault();
            });
        },

        char_info_pane: function () {
            return $('<div class="char-wrap"></div>').append(
                this.build_char_preview_pane(),
                this.build_char_details_pane()
            );
        },

        build_char_preview_pane: function () {
            return $('<div class="char-preview"></div>').append(
                $('<div class="char-preview-label">Character<br />Preview</div>'),
                this.build_preview_input(),
                this.build_char_buttons()
            );
        },

        build_preview_input: function () {
            var app = this;
            var cb = function() { app.char_changed(); };
            return this.$preview_input =
                $('<input type="text" class="char needs-font" title="Type or paste a character" />')
                .change( cb )
                .keypress(function() { setTimeout(cb, 50); })
                .mouseup(function() { setTimeout(cb, 50); })
                .mousewheel(function(event, delta) {
                    app.scroll_char(event, delta);
                    event.preventDefault();
                });
        },

        build_char_buttons: function () {
            var app = this;
            this.$prev_char_btn =
                $('<button class="char-prev" title="Previous character" />')
                    .text('Prev')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-w' } })
                    .click(function() { app.increment_code_point(-1); });
            this.$char_menu_btn =
                $('<button class="char-menu" title="Show code chart" />')
                    .text('Chart')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-s' } })
                    .click(function() { app.display_chart_dialog(); });
            this.$next_char_btn =
                $('<button class="char-next" title="Next character" />')
                    .text('Next')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-e' } })
                    .click(function() { app.increment_code_point(1); });
            this.$char_link =
                $('<a class="char-link" title="Link to this character" />')
                    .html('&#167;');
            return $('<span class="char-buttons" />').append(
                this.$prev_char_btn,
                this.$char_menu_btn,
                this.$next_char_btn,
                this.$char_link
            );
        },

        add_sample_chars: function () {
            if(this.opt.sample_chars) {
                this.$form.append( this.sample_char_links() );
            }
        },

        sample_char_links: function () {
            var app = this;
            var chars = this.opt.sample_chars;

            var $div = $(
                '<div class="sample-wrap" title="click character to select">'
                + 'Examples &#8230; </div>'
            );

            var $list = $('<ul></ul>');
            for(var i = 0; i < chars.length; i++) {
                $list.append(
                    $('<li></li>').text(codepoint_to_string(chars[i]))
                );
            }
            $div.append($list);

            $list.find('li').click(function () {
                app.set_preview_char($(this).text());
            });
            return $div;
        },

        add_code_chart_dialog: function () {
            var app = this;
            this.$chart_dialog = $('<div class="ucf-chart-dialog" />').append(
                this.build_code_chart_table(),
                this.build_code_chart_buttons()
            )
            .dialog({
                autoOpen:      false,
                title:         "Unicode Character Chart",
                resizable:     false,
                closeOnEscape: true,
                width:         555,
                height:        300
            });
        },

        build_code_chart_table: function () {
            var app = this;
            this.$code_chart_table = $('<table class="ucf-code-chart" />')
                .delegate('td', 'click', function() { app.code_chart_click(this); })
                .mousewheel(function(event, delta) {
                    app.change_chart_page(-1 * delta)
                    event.preventDefault();
                });
            return $('<div class="ucf-chart-wrapper" />')
                .append(this.$code_chart_table);
        },

        build_code_chart_buttons: function () {
            var app = this;
            return $('<div class="ucf-chart-buttons" />').append(
                $('<button>').text('Close').button({
                    icons: { primary: 'ui-icon-circle-close' }
                }).click( function() {
                    app.$chart_dialog.dialog("close");
                }),
                $('<button>').text('Next').button({
                    icons: { primary: 'ui-icon-circle-triangle-e' }
                }).click( function() {
                    app.change_chart_page(1);
                }),
                $('<button>').text('Prev').button({
                    icons: { primary: 'ui-icon-circle-triangle-w' }
                }).click( function() {
                    app.change_chart_page(-1);
                }),
                this.build_blocks_menu()
            );
        },

        build_blocks_menu: function () {
            var app = this;
            return this.$blocks_menu = $('<select class="ucf-block-menu">')
                .change(function() {
                    var block = app.code_blocks[$(this).val()];
                    var code_base = block.start_dec & 0xFFF80;
                    app.set_code_chart_page(code_base, null, false);
                });
        },

        build_char_details_pane: function () {
            this.$char_info = $('<div class="char-info"></div>');
            return $('<div class="char-props"></div>').append(
                $('<div class="char-props-label">Character<br />Properties</div>'),
                this.$char_info
            );
        },

        populate_code_blocks_menu: function () {
            for(var i = 0; i < this.code_blocks.length; i++) {
                this.$blocks_menu.append(
                    $('<option>').text(
                        this.code_blocks[i].start + ' ' + this.code_blocks[i].title
                    ).attr('value', i)
                );
            }
        },

        execute_search: function (target, response) {
            var result = [ ];
            var seen   = { };
            this.add_exact_matches(result, seen, target);
            target     = target.toUpperCase();
            var len    = this.code_list.length;
            var code, ch;
            for(var i = 0; i < len; i++) {
                if(result.length > 10) { break; };
                code = this.code_list[i];
                ch   = this.code_chart[code];
                if(
                    ch.description.indexOf(target) >= 0
                    || (ch.alias && ch.alias.indexOf(target) >= 0)
                ) {
                    this.add_result(result, seen, code, ch);
                }
            }
            if(result.length == 0) {
                this.$search_input.removeClass('busy');
            }
            response(result);
        },

        add_exact_matches: function (result, seen, target) {
            var dec, hex, ch;
            if(target.match(/^&#(\d+);?$/) || target.match(/^(\d+)$/)) {
                dec = parseInt(RegExp.$1, 10);
                hex = dec2hex(dec, 4);
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[Decimal: ' + dec + ']');
                }
            }
            if(target.match(/^&#x([0-9a-f]+);?$/i) || target.match(/^(?:U[+])?([0-9a-f]+)$/i)) {
                dec = hex2dec(RegExp.$1);
                hex = dec2hex(dec, 4);
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch);
                }
            }
            if(target.match(/^(?:&#?)?(\w+);?$/)) {
                target = RegExp.$1;
            }
            if(this.html_ent[target]) {
                hex = this.html_ent[target];
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[&' + target + ';]');
                }
            }
            else if(this.html_ent[target.toLowerCase()]) {
                hex = this.html_ent[target.toLowerCase()];
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[&' + target.toLowerCase() + ';]');
                }
            }
        },

        execute_regex_search: function (target, response) {
            var pattern = new RegExp(target, 'i');
            var result = [ ];
            var seen   = { };
            var len    = this.code_list.length;
            var code, ch;
            for(var i = 0; i < len; i++) {
                if(result.length > 10) { break; };
                code = this.code_list[i];
                ch   = this.code_chart[code];
                if(
                    pattern.test(ch.description)
                    || (ch.alias && pattern.test(ch.description))
                ) {
                    this.add_result(result, seen, code, ch);
                }
            }
            if(result.length == 0) {
                this.$search_input.removeClass('busy');
            }
            response(result);
        },

        add_result: function (result, seen, code, ch, extra) {
            if(seen[code]) {
                return;
            }
            var character = codepoint_to_string(hex2dec(code));
            var descr = ch.description;
            if(extra) {
                descr = extra + ' ' + descr;
            }
            var $div = $('<div />').text(descr);
            if(ch.alias) {
                $div.append( $('<span class="code-alias" />').text(ch.alias) );
            }
            result.push({
                'code': code,
                'character': character,
                'label': '<div class="code-point">U+' + code + '</div>'
                         + '<div class="code-sample">&#160;' + character
                         + '</div><div class="code-descr">' + $div.html()
                         + '</div>'
            });
            seen[code] = true;
        },

        char_changed: function () {
            var txt = this.$preview_input.val();
            var len = txt.length;
            if(len == 0) {
                this.$form.addClass('empty');
                this.$prev_char_btn.button('disable');
                this.$next_char_btn.button('disable');
            }
            else {
                this.$form.removeClass('empty');
                this.$prev_char_btn.button('enable');
                this.$next_char_btn.button('enable');
            }
            if(len > 1) {
                if((txt.charCodeAt(len - 2) & 0xF800) == 0xD800) {
                    this.$preview_input.val(txt.substr(txt.length - 2, 2));
                }
                else {
                    this.$preview_input.val(txt.substr(txt.length - 1, 1));
                }
            }
            this.examine_char();
        },

        examine_char: function () {
            var ch = this.$preview_input.val();
            if(ch == this.last_char) {
                return;
            }
            if(ch.length == 0) {
                return;
            }
            this.last_char = ch;
            var code  = string_to_codepoint(ch);
            var hex   = dec2hex(code, 4);
            var block = this.block_from_codepoint(code);
            ch        = this.code_chart[hex];
            this.$char_link.attr('href', '?c=U+' + hex);

            var $table = $('<table />').append(
                $('<tr />').append(
                    $('<th />').text('Code point'),
                    $('<td />').text('U+' + hex)
                )
            );
            if(ch && ch.description.length > 0) {
                var $td = $('<td />').text(ch.description);
                if(ch.alias) {
                    $td.append(
                        $('<br />'),
                        $('<span class="alias"/>').text(ch.alias)
                    );
                }
                $table.append(
                    $('<tr />').append( $('<th />').text('Description'), $td )
                );
            }
            var entity = '&#' + code + ';';
            if(this.html_name[hex]) {
                entity = entity + ' or &' + this.html_name[hex] + ';';
            }
            $table.append(
                $('<tr />').append(
                    $('<th />').text('HTML entity'),
                    $('<td />').text(entity)
                ),
                $('<tr />').append(
                    $('<th />').text('UTF-8'),
                    $('<td />').text(dec2utf8(code))
                ),
                $('<tr />').append(
                    $('<th />').text('UTF-16'),
                    $('<td />').text(dec2utf16(code))
                )
            );
            if(block) {
                var $pdf_link = $('<a />')
                    .text(block.title)
                    .attr('href', block.pdf_url)
                    .attr('title', block.filename + ' at Unicode.org');
                $table.append(
                    $('<tr />').append(
                        $('<th />').text('Character block'),
                        $('<td />').append($pdf_link)
                    )
                );
            }
            this.$char_info.empty().append($table);
        },

        increment_code_point: function (inc) {
            var ch = this.last_char;
            if(!ch) { return; }
            var code = string_to_codepoint(ch) + inc;
            var hex  = dec2hex(code, 4);
            while(!this.code_chart[hex]) {
                code = code + inc;
                if(code < 0) { return; }
                hex = dec2hex(code, 4);
            }
            this.set_preview_char(codepoint_to_string(code));
        },

        scroll_char: function (event, delta) {
            if(!event.ctrlKey) {
                this.increment_code_point(delta < 0 ? 1 : -1);
                return;
            }
            var ch = this.last_char;
            if(!ch) { return; }
            var code = string_to_codepoint(ch);
            var block = this.block_from_codepoint(code);
            var i = block.index + (delta < 0 ? 1 : -1);
            if(!this.code_blocks[i]) { return; }
            this.set_preview_char(codepoint_to_string(this.code_blocks[i].start_dec));
            return;
        },

        display_chart_dialog: function () {
            window.scrollTo(0,0);
            var code = string_to_codepoint(this.$preview_input.val());
            var rect = this.$el[0].getBoundingClientRect();
            this.set_code_chart_page(null, code, true);
            this.$chart_dialog
                .dialog('option', 'position', [rect.left - 1, 248])
                .dialog('open');
        },

        set_code_chart_page: function (code, target_code, set_menu) {
            if(code == null) {
                code  = target_code & 0xFFF80;
            }
            this.code_chart_base = code;

            var $dlg = this.$chart_dialog
            $dlg.dialog('option', 'title', 'Unicode Character Chart '
                + dec2hex(code, 4) + ' - ' + dec2hex(code + 0x7F, 4)
            );
            if(set_menu) {
                var block = this.block_from_codepoint(code);
                if(block) {
                    this.$blocks_menu.val(block.index);
                }
            }

            var $tbody = $('<tbody />');
            var i, j, $row, $cell, meta;
            for(i = 0; i < 8; i++) {
                $row = $('<tr />');
                for(j = 0; j < 16; j++) {
                    $cell = $('<td />');
                    meta = this.code_chart[dec2hex(code, 4)];
                    if(meta) {
                        $cell.text(codepoint_to_string(code));
                        if(code == target_code) {
                            $cell.addClass('curr-char');
                        }
                    }
                    else {
                        $cell.addClass('reserved');
                    }
                    $row.append($cell);
                    code++;
                }
                $tbody.append($row);
            }
            this.$code_chart_table.empty().append($tbody);
        },

        code_chart_click: function (td) {
            var $td = $(td);
            var code = this.code_chart_base;
            $td.prevAll().each(function() { code++; });
            $td.parent().prevAll().each(function() { code += 16; });
            this.set_preview_char(codepoint_to_string(code));
            $td.parent().parent().find('td').removeClass('curr-char');
            $td.addClass('curr-char');
        },

        change_chart_page: function (incr) {
            var code_base = this.code_chart_base;
            if(incr < 0  &&  code_base == 0) {
                return;
            }
            code_base = code_base + (incr * 128);
            this.set_code_chart_page(code_base, null, true);
        },

        save_font: function (new_font) {
            this.$el.find('.needs-font').css({'fontFamily': new_font});
            this.$code_chart_table.css({'fontFamily': new_font});
        },

        load_unicode_data: function (handler) {
            var app = this;
            var data_url = this.opt.data_file_no_unihan;
            $.get(data_url, null, function(data, status) {
                app.parse_unicode_data(data, status, handler);
            }, 'text' );
        },

        parse_unicode_data: function (data, status, handler) {
            var i = 0;
            var j, str, line, row, offset, code, block;
            var curr_cp = 0;
            while(i < data.length) {
                j = data.indexOf("\n", i);
                if(j < 1) { break; }
                line = data.substring(i, j);
                row = line.split("\t");
                if(line.match(/^\[/)) {
                    row[0] = row[0].replace(/^\[/, '');
                    block = {
                        'start'    : row[0],
                        'end'      : row[1],
                        'start_dec': hex2dec(row[0]),
                        'end_dec'  : hex2dec(row[1]),
                        'title'    : row[2],
                        'filename' : row[3],
                        'pdf_url'  : row[4],
                        'index'    : this.code_blocks.length
                    };
                    this.code_blocks.push(block);
                }
                else if(line.match(/^\&/)) {
                    row[0] = row[0].replace(/^\&/, '');
                    this.html_ent[row[0]]  = row[1];    // Map name to code eg: nbsp => 00A0
                    this.html_name[row[1]] = row[0];    // Map code to name eg: 0233 => eacute
                }
                else {
                    offset = row.shift();
                    if(offset === '') {
                        offset = 1;
                    }
                    curr_cp += parseInt(offset, 10);
                    code = dec2hex(curr_cp, 4);
                    this.code_chart[code] = {
                        'description': row[0]
                    };
                    if(row[1] && row[1].length > 0) {
                        this.code_chart[code].alias = row[1];
                    }
                    this.code_list.push(code);
                }
                i = j + 1;
            }
            handler.call(this);
        },

        block_from_codepoint: function (code) {
            for(var i = 0; i < this.code_blocks.length; i++) {
                if(code > this.code_blocks[i].end_dec){
                    continue;
                }
                if(code < this.code_blocks[i].start_dec){
                    return null;
                }
                return this.code_blocks[i];
            }
            return null;
        }

    };


    /* UnicodeCharacterFinder Plugin Definition
     * ======================================== */

    $.fn.ucf = function(options) {
        options = $.extend($.fn.ucf.defaults, options);

        return this.each(function(x) {
            var app = new UnicodeCharacterFinder(this, options);
            $(this).data('UnicodeCharacterFinder', app);
        });
    };

    $.fn.ucf.defaults = {
        data_file_no_unihan: 'char-data-nounihan.txt'
    };

})(jQuery);

