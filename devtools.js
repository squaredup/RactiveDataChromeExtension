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
            chrome.devtools.inspectedWindow.eval('Ractive.getNodeInfo($0).ractive.component.name', updatePane);
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
        
        /*
         * The chrome console query, can use all libraries available to the console as it is not called outside that context.
         */
        function getQuery() {

            let version = (Ractive.VERSION || '').split('.').map(part => parseInt(part, 10));
            let computationsExposeValue = version[0] > 0 || version[1] >= 9;

            let properties = {};

            // Data properties
            if (!$0 || !$0._ractive) { 
                return {message: 'Select a Ractive node for more details'};
            } else if (Ractive.getNodeInfo($0)) { // works for 0.7-0.9
                Object.assign(properties, Ractive.getNodeInfo($0).ractive.get()); 
            } else {
                return {message: 'Unsupported Ractive version'};
            }

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
            
            // computed properties
            let computations = Ractive.getNodeInfo($0).ractive.viewmodel.computations;

            let computeds = Object.keys(computations)
                .filter(key => computationsExposeValue || !key.startsWith('${'))
                .reduce((acc, key) => {
                    acc[key] = computationsExposeValue ? computations[key].value : computations[key].getter();
                    return acc;
                }, {});

            properties['Computed Properties'] = computeds;

            return properties;
        }

        // runs initial update
        update();
        // every time the selection changes in the elements panel, update is called
        chrome.devtools.panels.elements.onSelectionChanged.addListener(update); 
    }
);