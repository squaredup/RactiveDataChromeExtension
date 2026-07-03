// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* Sidebar extension to display details about Ractive Components
 * Currently displays:
 * Component name
 * Data properties
 * Computed properties
 * Inherited properties
 */
chrome.devtools.panels.elements.createSidebarPane(
    "Ractive Data",
    function(sidebar) {

        /*
         *  Queries the name of the selected component and passes the result to updatePane
         */
        function update() {
            let nameQuery = '(function () {' +
                'var info = (typeof Ractive !== "undefined" && $0 && $0._ractive) ? Ractive.getNodeInfo($0) : null;' +
                'return (info && info.ractive.component) ? info.ractive.component.name : "";' +
            '})()';
            chrome.devtools.inspectedWindow.eval(nameQuery, updatePane);
        }

        /*
         *  Parses the getQuery function to a string then wraps it to make it evaluate as an expression. 
         *  Sends the result to the sidebar
         *  @param compName the name of the component being queried
         */
        function updatePane(compName) {
            var query = "(" + getQuery.toString() + ")()";
            sidebar.setExpression(query,compName);
        }

        let lastSignature;
        let pollTimer;
        const POLL_INTERVAL_MS = 1000;

        /*
         *  Re-evaluates the component on an interval but only re-renders when
         *  the data has actually changed, so an expanded tree is not collapsed
         *  on every tick.
         */
        function refresh() {
            var signatureQuery = "(" + getQuery.toString() + ")('signature')";
            chrome.devtools.inspectedWindow.eval(signatureQuery, function (signature, exceptionInfo) {
                if (exceptionInfo || signature === lastSignature) {
                    return;
                }
                lastSignature = signature;
                update();
            });
        }

        function startPolling() {
            update();
            pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
        }

        function stopPolling() {
            clearInterval(pollTimer);
        }

        /*
         * The chrome console query, can use all libraries available to the console as it is not called outside that context.
         */
        function getQuery(mode) {

            let result = buildProperties();

            if (mode !== 'signature') {
                return result;
            }

            // Signature is used only for change detection, so functions and
            // circular references collapse to stable tokens: equal data must
            // always produce an equal string.
            try {
                let seen = new WeakSet();
                return JSON.stringify(result, (key, value) => {
                    if (typeof value === 'function') {
                        return 'ƒ';
                    }
                    if (value && typeof value === 'object') {
                        if (seen.has(value)) {
                            return '[Circular]';
                        }
                        seen.add(value);
                    }
                    return value;
                });
            } catch (error) {
                return 'signature-unavailable';
            }

            function buildProperties() {

                if (typeof Ractive === 'undefined') {
                    return {message: 'Ractive was not found on this page'};
                }

                let version = (Ractive.VERSION || '').split('.').map(part => parseInt(part, 10));
                let computationsExposeValue = version[0] > 0 || version[1] >= 9;

                let properties = {};

                // Data properties
                if (!$0 || !$0._ractive) {
                    return {message: 'Select a Ractive node for more details'};
                }

                let info = Ractive.getNodeInfo($0);
                if (!info) {
                    return {message: 'Unsupported Ractive version'};
                }

                let ractive = info.ractive;
                Object.assign(properties, ractive.get()); // works for 0.7-0.9

                // inherited properties - currently only supports SquaredUp
                if (Ractive.components.SquaredUpBase) {
                    // component's superclass' data
                    let superClass = (Ractive.components.SquaredUpBase().get()); // TODO: find dynamic way of getting superclass if possible

                    // keys for component and its parent
                    let compKeys = Object.keys(properties);
                    let superKeys = Object.keys(superClass);

                    // seperate "lists" for inhertied and non inherited components
                    let inheriteds = {};
                    let nonInheriteds = {};

                    // for every property, if the super class has that property then add to inherited object, else add to non inherited
                    for (let key of compKeys) {
                        if (superKeys.indexOf(key) === -1) {
                            nonInheriteds[key] = properties[key];
                        } else {
                            inheriteds[key] = properties[key];
                        }
                    }

                    // add the inherited properties object to the non inhertied objects (makes a seperate folder in display)
                    nonInheriteds['Inherited Properties'] = inheriteds;
                    // reassign properties to non inhertied object (with inherited added as a sub-object) to ensure program still works with non-squp webpages
                    properties = nonInheriteds;
                }

                // computed properties (viewmodel.computations in 0.9, viewmodel.computed in 1.x)
                let viewmodel = ractive.viewmodel;
                let computations = viewmodel.computations || viewmodel.computed || {};

                let computeds = {};
                Object.keys(computations)
                    .filter(key => computationsExposeValue || !key.startsWith('${'))
                    .forEach(key => {
                        try {
                            computeds[key] = readComputation(computations[key]);
                        } catch (error) {
                            computeds[key] = '⚠ ' + error.message;
                        }
                    });

                properties['Computed Properties'] = computeds;

                return properties;
            }

            // .value can be stale until recomputed, so prefer .get(); .getter() is the pre-0.9 shape.
            function readComputation(computation) {
                if (typeof computation.get === 'function') {
                    return computation.get();
                }
                if (typeof computation.getter === 'function') {
                    return computation.getter();
                }
                return computation.value;
            }
        }

        // initial paint
        update();
        // update immediately when the inspected element changes
        chrome.devtools.panels.elements.onSelectionChanged.addListener(update);
        // only poll for data changes while the pane is actually visible
        sidebar.onShown.addListener(startPolling);
        sidebar.onHidden.addListener(stopPolling);
    }
);