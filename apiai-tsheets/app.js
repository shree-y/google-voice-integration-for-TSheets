/**
 * Created by Shree Yalamanchili on 2/26/17.
 */

'use strict';

// For debugging - to see the logs
//process.env.DEBUG = 'actions-on-google:*';


// Boilerplate setup
let ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
let express = require('express');
let bodyParser = require('body-parser');
let Promise = require('promise');
let moment = require('moment');


let endPoint = 'https://rest.tsheets.com/api/v1/';


let app = express();
app.set('port', (process.env.PORT || 8080));
app.use(bodyParser.json({type: 'application/json'}));

// Create an instance of ApiAiAssistant
app.post('/', function (request, response) {
    const assistant = new ApiAiAssistant({request: request, response: response});
    
    const WELCOME_ACTION = 'input.welcome';
    
    const CLOCK_IN_ACTION = 'clock_in';
    const JOBCODE_ARGUMENT = 'jobcode';
    
    const TOTAL_TIME_ACTION = 'total_time';
    const DATE_ARGUMENT = 'date';
    const DURATION_ARGUMENT = 'date-period';
    
    const CLOCK_OUT_ACTION = 'clock_out';
    

    /**
     * Promise for getting user data from TSheets app
     * @returns {*} On resolve (success) returns json payload containing user information
     *              On reject (failure) returns HTTP Status message
     */
    const getUserData = (user) => {

        return new Promise((resolve, reject) => {
            let request = require('request');

            let options = {
                url: `${endPoint}current_user`,
                auth: {
                    bearer: assistant.getUser().access_token
                }
            };

            console.log('DEBUG => getUserData: Requesting for current user info:');
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log('DEBUG => getUserData: Success getting current user data.');
                    let userData = JSON.parse(body);
                    user.userName = _getUserName(userData);
                    user.userId = _getUserId(userData);
                    resolve(user);
                }
                else {
                    console.log('DEBUG => getUserData: Failed to get current user data! Status Code:' + response.statusCode +
                        ', Status message:' + response.statusMessage);
                    reject(response.statusMessage);
                }
            });

        });
    };
    

    /**
     * Function to parse JSON payload to get the username
     * @param userData  JSON response from the TSheets API
     * @returns {string}    complete user name
     * @private
     */
    const _getUserName = (userData) => {
        let firstName = getValues(userData, 'first_name');
        let lastName = getValues(userData, 'last_name');
        return firstName.toString() + ' ' + lastName.toString();
    };
    
    
    /**
     * Parse user json payload and get userId
     * @param userData json payload
     * @returns {int} userId
     * @private
     */
    const _getUserId = (userData) => {
        return getValues(userData.results.users, 'id').toString();
    };
    
    
    /**
     * Promisify getting jobcode assignments
     * @returns {*} On resolve (successs) returns json payload with jobcode assignments
     *              On reject (failure) returns HTTP status message
     */
    const getUserJobCodeAssignments  = (jobCode) => {

        return new Promise((resolve, reject) => {
            let request = require('request');

            const options = {
                url: `${endPoint}jobcode_assignments`,
                auth: {
                    bearer: assistant.getUser().access_token
                }
            };

            console.log('DEBUG => getUserJobCodeAssignments: Requesting for current user job code assignments:');
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log('DEBUG => getUserJobCodeAssignments: Success, request completed!');
                    const jobCodeDictionary = _getJobCodeDictionary(body);

                    if (jobCodeDictionary.hasOwnProperty(jobCode.jobCodeName)) {
                        console.log('DEBUG => getUserJobCodeAssignments: Found jobcode: ' + jobCode.jobCodeName);
                        jobCode.jobCodeId = jobCodeDictionary[jobCode.jobCodeName];
                        resolve(jobCode);
                    }
                    else {
                        console.log('DEBUG => getUserJobCodeAssignments: Jobcode not found');
                        reject('Sorry, I cannot find ' + jobCode.jobCodeName + ' in your list of jobcodes assigned to you.');
                    }
                }
                else {
                    console.log('DEBUG => getUserJobCodeAssignments: Failed, request completed! Status Code:' + response.statusCode +
                        ', Status message:' + response.statusMessage);
                    reject('Sorry, Shree may have deployed timecard. TSheets is down!');
                }
            });

        });
    };
    

    /**
     * A dictionary with key: jobCodeName and value: jobCodeId
     * @param userJobCodeAssignments  JSON String   User's job code assignments
     * @returns {{}} Job code dictionary
     * @private
     */
    const _getJobCodeDictionary = (userJobCodeAssignments) => {
        let jobCodeAssignments = JSON.parse(userJobCodeAssignments);
        let jobCodes = jobCodeAssignments.supplemental_data.jobcodes;
        let jobCodeDictionary = {};
        for (let id in jobCodes) {
            for (let property in jobCodes[id]) {
                if ((property == 'active') && (jobCodes[id][property] == true)) {
                    let jobCodeName = (jobCodes[id]['name']).toLowerCase();
                    jobCodeDictionary[jobCodeName] = id;
                }
            }
        }
        return jobCodeDictionary;
    };


    /**
     * Promisify creating timesheet 
     * @param jobCode   object  properties required to create a timesheet
     * @returns {*}     On success or failure, Assistant lets the user know about it 
     */
    const createTimesheet = (jobCode) => {
        return new Promise((resolve, reject) => {
            const regularTimesheetJson = _getRegularTimesheetJson(jobCode);
            _createTimesheet(regularTimesheetJson, jobCode, resolve, reject);
        })
    };


    /**
     * Get regular timesheet JSON string to be sent to the server
     * 
     * @param jobCode   object  jobcode object that contains all the properties 
     *                          required to create a timesheet object
     * @private
     */
    const _getRegularTimesheetJson = (jobCode) => {
        let timesheet = {};
        timesheet.user_id = jobCode.userId;
        timesheet.jobcode_id = jobCode.jobCodeId;
        timesheet.type = 'regular';

        let date = moment();
        timesheet.start = date.format();
        timesheet.end = '';
        
        return JSON.stringify({
            data: [
                timesheet
            ]
        });
    };


    /**
     * Promisify adding timesheet 
     * 
     * @param data      json    Timesheet object converted to json
     * @param jobCode   object  Contains job code related properties, id, name, user_id etc
     * @param resolve   string  On success, this string is returned to assistant
     * @param reject    string  On failure, this string is retured to assistant
     * 
     * @private
     */
    const _createTimesheet = (data, jobCode, resolve, reject) => {
        let request = require('request');

        let options = {
            url: `${endPoint}timesheets`,
            auth: {
                bearer: assistant.getUser().access_token
            },
            body: data
        };

        console.log('DEBUG => createTimesheet: Creating a timesheet:');
        request.post(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let response = JSON.parse(body);
                let statusCode = getValues(response, '_status_code'); 
                if (statusCode == 406) {
                    console.log(`DEBUG => createTimesheet: Failed. ${jobCode.userName} is already on the clock!`);
                    // Adding the time since the employee is working
                    reject(`You are already on the clock, ${jobCode.userName}!`);
                }
                else if (statusCode == 200) {
                    console.log('DEBUG => createTimesheet: Success. Created a timesheet');
                    resolve(`You are clocked into ${jobCode.jobCodeName}`);
                }
                else {
                    console.log('DEBUG => createTimesheet: Failed.');
                    reject('Sorry, I am having trouble talking to our servers. Please try again later!');
                }
            }
            else {
                console.log(`DEBUG => createTimesheet: Failed to create a timesheet! Status Code: ${response.statusCode}, 
                Status message: ${response.statusMessage}`);
                reject('Sorry, I am having trouble talking to our servers. Please try again later!');
            }
        });
    };

    /**
     * Helper function to make the necessary api calls to clock into a job code
     * @param jobCodeName string    jobcode that user would like to clock into
     * @private
     */
     const _clockIn = (jobCodeName) => {
        let timesheet = {};
        timesheet.jobCodeName = jobCodeName.toLowerCase();
        getUserJobCodeAssignments(timesheet)
            .then(getUserData)
            .then(createTimesheet)
            .then(response => {
                assistant.ask(response);
            })
            .catch(response => {
                    assistant.ask(response);
            });
    };


    /**
     * Promisify get timesheets.
     * 
     * @param timesheet timesheet properties required to make api call to get timesheets
     *                  start_date
     *                  end_date
     *                  user_ids
     *                  on_the_clock
     *                  jobcode_type
     * @returns {*}     on success, returns a response with total time in it
     *                  on failure, returns a response that server responded with
     */
    const getTimesheets = (timesheet) => {
         return new Promise((resolve, reject) => {
             let request = require('request');

             let options = {
                 url: `${endPoint}timesheets`,
                 auth: {
                     bearer: assistant.getUser().access_token
                 },
                 qs: {
                     start_date: timesheet.startDate,
                     end_date: timesheet.endDate,
                     user_ids: timesheet.userId,
                     on_the_clock: timesheet.onTheClock,
                     jobcode_type: timesheet.jobCodeType
                 }
             };
             
             console.log('DEBUG => getTimesheets: Requesting timesheets..');
             request(options, function (error, response, body) {
                 if (!error && response.statusCode == 200) {
                     console.log('DEBUG => getTimesheets: Success, request completed!');
                     let result = JSON.parse(body);
                     let response = _calculate_duration(result);
                     resolve(response);
                 }
                 else {
                     console.log('DEBUG => getTimesheets: Failed, request completed! Status Code:' + response.statusCode +
                         ', Status message:' + response.statusMessage);
                     reject('Sorry, I am having trouble talking to our servers. Please try again later!');
                 }
             });
             
         });
     };


    /**
     * Parses get timesheets json string and calculates the total time
     * @param jsonResult    json string
     * @returns {*}         string - response for api.ai
     * @private
     */
    const _calculate_duration = (jsonResult) => {
         let timesheets = jsonResult.results.timesheets;
         let duration = 0;
         if (timesheets.length === 0) {
             return 'I did not find any timesheets';
         }
         for (let timesheet in timesheets) {
             for(let key in timesheets[timesheet]) {
                 if (key === 'duration') {
                     //console.log(key + ": " + timesheets[timesheet][key]);
                     duration += timesheets[timesheet][key];
                 }
             }
         }
         return _hours_worked(duration);
     };


    /**
     * Helper function to convert duration to humanized hours and minutes
     * @param duration  int seconds
     * @returns {string} response from Api.AI to the user
     * @private
     */
    const _hours_worked = (duration) => {
        let hours = Math.floor(moment.duration(duration, 'seconds').asHours());
        let minutes = Math.floor(moment.duration(duration, 'seconds').asMinutes()) - (hours * 60);
        if (minutes == 0) {
            return `You have worked ${hours} hours.`;
        }
        else {
            return `You have worked ${hours} hours and ${minutes} minutes.`;
        }
    };


    /**
     * Promisify get a timesheet.
     *
     * @param timesheet timesheet properties required to make api call to get a timesheet
     *                  start_date
     *                  end_date
     *                  user_ids
     *                  on_the_clock
     *                  jobcode_type
     * @returns {*}     on success, returns a response with timesheet_id
     *                  on failure, returns a response that server responded with
     */
    const getTimesheet = (timesheet) => {
        return new Promise((resolve, reject) => {
            let request = require('request');

            let options = {
                url: `${endPoint}timesheets`,
                auth: {
                    bearer: assistant.getUser().access_token
                },
                qs: {
                    start_date: timesheet.startDate,
                    user_ids: timesheet.userId,
                    on_the_clock: timesheet.onTheClock,
                    jobcode_type: timesheet.jobCodeType
                }
            };

            console.log('DEBUG => getTimesheet: Requesting a timesheet..');
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log('DEBUG => getTimesheet: Success, request completed!');
                    let result = JSON.parse(body);
                    timesheet.timesheetId = getValues(result.results.timesheets, 'id').toString();
                    resolve(timesheet);
                }
                else {
                    console.log('DEBUG => getTimesheet: Failed, request completed! Status Code:' + response.statusCode +
                        ', Status message:' + response.statusMessage);
                    reject('Sorry, I am having trouble talking to our servers. Please try again later!');
                }
            });

        });
    };


    /**
     * Promisify editing a timesheet
     *
     * @param timesheet   object  Contains timesheet related properties
     * @private
     */
    const editTimesheet = (timesheet) => {
        return new Promise((resolve, reject) => {
            let request = require('request');

            let date = moment();
            let data = JSON.stringify({
                data: [
                    {
                        id: timesheet.timesheetId,
                        end: date.format()
                    }
                ]
            });
            let options = {
                url: `${endPoint}timesheets`,
                auth: {
                    bearer: assistant.getUser().access_token
                },
                body: data
            };

            console.log('DEBUG => editTimesheet: editing a timesheet:');
            request.put(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    let response = JSON.parse(body);
                    let statusCode = getValues(response, '_status_code');
                    if (statusCode == 200) {
                        console.log('DEBUG => editTimesheet: Success. Edited a timesheet');
                        resolve('Timesheet edit complete!');
                    }
                    else {
                        console.log('DEBUG => editTimesheet: Failed.');
                        reject('Sorry, I am having trouble talking to our servers. Please try again later!');
                    }
                }
                else {
                    console.log(`DEBUG => editTimesheet: Failed to edit a timesheet! Status Code: ${response.statusCode}, 
                    Status message: ${response.statusMessage}`);
                    reject('Sorry, I am having trouble talking to our servers. Please try again later!');
                }
            });
        });
    };
    
    
    /**
     * Welcome intent.
     * @param assistant API.AI Assistant
     */
    const welcomeAction = (assistant) => {
        let user = {};
        getUserData(user)
            .then(user => {
                // Fulfillment: Welcome the user with their name
                assistant.ask('Welcome to TSheets, ' + user.userName + '! What can I do for you?');        
            })
            .catch(response => {
                    // On errors (reject), just a generic welcome message
                    console.log('DEBUG => welcomeAction: Failed to get user data: ' + response);
                    assistant.ask('Welcome to TSheets! What can I do for you?');
                }
            );
    };
    
    
    /**
     * Clock in intent. This is the main function called when user wants to clock in
     * 
     * @param assistant API.AI Assistant through which we get the job code that user would like to clock into
     */
    const clockInAction = (assistant) => {
        let jobCodeName = assistant.getArgument(JOBCODE_ARGUMENT);
        _clockIn(jobCodeName);
    };


    /**
     * Total time intent. Returns the total time user worked on a given date or in a certain duration
     * @param assistant API.AI Assistant through which we get the date and duration
     */
    const totalTimeAction = (assistant) => {
        let date = assistant.getArgument(DATE_ARGUMENT);
        let duration = assistant.getArgument(DURATION_ARGUMENT);
        let givenADay = false;
        
        let timesheet = {};
        timesheet.jobCodeType = 'regular';
        timesheet.onTheClock = 'both';
        
        if (typeof date === 'undefined' && typeof duration === 'undefined') {
            // Default to current week?
            assistant.ask('Dude, I am smart but to give you a perfect answer, you need to ask me a perfect question!');
            return;
        }
        // If a date is provided, then set start and end date to the same date
        else if (typeof date !== 'undefined' && typeof duration === 'undefined') {
            timesheet.startDate = date;
            timesheet.endDate = date;
            givenADay = true;
        }
        // If duration is provided, parse the string to get the start and end dates
        else {
            let index = duration.indexOf('/');
            timesheet.startDate = duration.substring(0, index);
            timesheet.endDate =  duration.substring(index+1);
            
        }
        // console.log('DEBUG: totalTimeAction, start_date: ' + timesheet.start_date);
        // console.log('DEBUG: totalTimeAction, end_date: ' + timesheet.end_date);
        
        getUserData(timesheet)
            .then(getTimesheets)
            .then(response => {
                if (givenADay) {
                    assistant.ask(`${response} on ${date}`);
                }
                else {
                    assistant.ask(`${response} from ${timesheet.startDate} to ${timesheet.endDate}`)
                }
            })
            .catch(response => {
                assistant.ask(response);
            });
    };
    
    
    const clockOutAction = (assistant) => {
        let timesheet = {};
        timesheet.startDate = moment().format('YYYY-MM-DD');
        timesheet.jobCodeType = 'regular';
        timesheet.onTheClock = 'yes';
        getUserData(timesheet)
            .then(getTimesheet)
            .then(editTimesheet)
            .then(response => {
               assistant.ask(`Alright, I clocked you out! Now, get outta here!`); 
            })
            .catch(response => {
                assistant.ask(response);
            });
    };
    
    
    // Some helpful functions to parse and search json objects
    // Source: http://techslides.com/how-to-parse-and-search-json-in-javascript
    //return an array of objects according to key, value, or key and value matching
    function getObjects(obj, key, val) {
        let objects = [];
        for (let i in obj) {
            if (!obj.hasOwnProperty(i)) continue;
            if (typeof obj[i] == 'object') {
                objects = objects.concat(getObjects(obj[i], key, val));
            } else
            //if key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
            if (i == key && obj[i] == val || i == key && val == '') { //
                objects.push(obj);
            } else if (obj[i] == val && key == ''){
                //only add if the object is not already in the array
                if (objects.lastIndexOf(obj) == -1){
                    objects.push(obj);
                }
            }
        }
        return objects;
    }

    //return an array of values that match on a certain key
    function getValues(obj, key) {
        let objects = [];
        for (let i in obj) {
            if (!obj.hasOwnProperty(i)) continue;
            if (typeof obj[i] == 'object') {
                objects = objects.concat(getValues(obj[i], key));
            } else if (i == key) {
                objects.push(obj[i]);
            }
        }
        return objects;
    }

    //return an array of keys that match on a certain value
    function getKeys(obj, val) {
        let objects = [];
        for (let i in obj) {
            if (!obj.hasOwnProperty(i)) continue;
            if (typeof obj[i] == 'object') {
                objects = objects.concat(getKeys(obj[i], val));
            } else if (obj[i] == val) {
                objects.push(i);
            }
        }
        return objects;
    }
   
    const actionMap = new Map();
    actionMap.set(WELCOME_ACTION, welcomeAction);
    actionMap.set(CLOCK_IN_ACTION, clockInAction);
    actionMap.set(CLOCK_OUT_ACTION, clockOutAction);
    actionMap.set(TOTAL_TIME_ACTION, totalTimeAction);
    assistant.handleRequest(actionMap);
});

// Create functions to handle requests here


// Start the server
let server = app.listen(app.get('port'), function () {
    console.log('App listening on port %s', server.address().port);
    console.log('Press Ctrl+C to quit.');
});