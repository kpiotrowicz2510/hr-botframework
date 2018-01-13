// This loads the environment variables from the .env file
require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');
var Store = require('./store');
var spellService = require('./spell-service');
var requestLeaveDateFrom = "";
var requestLeaveDateTo = "";

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});
// Create connector and listen for messages
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
});

// You can provide your own model by specifing the 'LUIS_MODEL_URL' environment variable
// This Url can be obtained by uploading or creating your model from the LUIS portal: https://www.luis.ai/
var recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(recognizer);

bot.dialog('Greeting', function (session) {
    session.endDialog('Hi, my name is Alice! Try asking me things like \'How many free days do I have?\', \'Show me my holidays schedule\'');
}).triggerAction({
    matches: 'Greeting'
});

bot.dialog('CheckDaysOff',
    function (session) {
        //session.send('We are analyzing your message: \'%s\'', session.message.text);
        var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .title("Your days off balance")
            .subtitle("Days used: 10")
            .text("Days left: 16")
            .images([])
            .buttons([
                builder.CardAction.imBack(session, "request leave", "Request leave")
            ])
    ]);
    
    session.send(msg).endDialog();
    }
).triggerAction({
    matches: 'CheckDaysOff'
});

bot.dialog('RequestLeave',
    [function (session,args,next) {
    builder.Prompts.text(session, 'From?');
    },
    function (session, results){
        requestLeaveDateFrom = results.response;
        builder.Prompts.text(session, 'To?');
    },
    function (session, results){
        requestLeaveDateTo = results.response;
        var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    msg.attachments([
        new builder.HeroCard(session)
            .title("Your leave request")
            .subtitle("Are you sure?")
            .text("From "+requestLeaveDateFrom+" to "+requestLeaveDateTo)
            .images([])
            .buttons([
                builder.CardAction.imBack(session, "accept", "Accept"),
                builder.CardAction.imBack(session, "cancel", "Cancel")
            ])
    ]);
    
    builder.Prompts.text(session,msg);
    },
    function (session, results){
        if(results.response=="accept"){
            session.send("Your leave request has been sent to your manager!");
        }else{
            session.send('Request canceled');
        }
    }
]
).triggerAction({
    matches: 'RequestLeave'
});

bot.dialog('Communication.CheckIMStatus',
    [function (session,args,next) {
        var nameEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'UserName');
        var surnameEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'surname');

        var msg = new builder.Message(session);
        msg.attachmentLayout(builder.AttachmentLayout.carousel)
        msg.attachments([
            new builder.HeroCard(session)
                .title("I have found "+nameEntity.entity+" "+surnameEntity.entity)
                .subtitle("")
                .text("With what action you want to proceed?")
                .images([])
                .buttons([
                    builder.CardAction.imBack(session, "meeting", "Schedule meeting"),
                    builder.CardAction.imBack(session, "available", "Check Availability")
                ])
        ]);

        builder.Prompts.text(session,msg);
    },
    function (session, results){
            if(results.response == "meeting"){
                session.beginDialog('scheduleMeeting');
            }
            if(results.response == "available"){
                session.beginDialog('checkAvailability')
            }
    }
]
).triggerAction({
    matches: 'Communication.CheckIMStatus'
});

bot.dialog('scheduleMeeting', function (session, args) {
    session.send("schedulemeeting");
}).triggerAction({
    matches: 'scheduleMeeting'
});

bot.dialog('checkAvailability', function (session, args) {
    session.send("checkavaiability");
}).triggerAction({
    matches: 'checkAvailability'
});

bot.dialog('ShowHotelsReviews', function (session, args) {
    // retrieve hotel name from matched entities
    var hotelEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Hotel');
    if (hotelEntity) {
        session.send('Looking for reviews of \'%s\'...', hotelEntity.entity);
        Store.searchHotelReviews(hotelEntity.entity)
            .then(function (reviews) {
                var message = new builder.Message()
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments(reviews.map(reviewAsAttachment));
                session.endDialog(message);
            });
    }
}).triggerAction({
    matches: 'ShowHotelsReviews'
});

bot.dialog('Help', function (session) {
    session.endDialog('Hi! Try asking me things like \'search hotels in Seattle\', \'search hotels near LAX airport\' or \'show me the reviews of The Bot Resort\'');
}).triggerAction({
    matches: 'Help'
});

// Spell Check
if (process.env.IS_SPELL_CORRECTION_ENABLED === 'true') {
    bot.use({
        botbuilder: function (session, next) {
            spellService
                .getCorrectedText(session.message.text)
                .then(function (text) {
                    session.message.text = text;
                    next();
                })
                .catch(function (error) {
                    console.error(error);
                    next();
                });
        }
    });
}

// Helpers
function daysOffAsAttachment(left, used){
    return new builder.HeroCard()
    .title("Your days off balance")
    .subtitle('%d days left. %d days used.', left, used)
    .images(['http://onet.pl'])
    .buttons([
        new builder.CardAction()
            .title('More details')
            .type('openUrl')
            .value('https://google.pl')
    ]);
}

function hotelAsAttachment(hotel) {
    return new builder.HeroCard()
        .title(hotel.name)
        .subtitle('%d stars. %d reviews. From $%d per night.', hotel.rating, hotel.numberOfReviews, hotel.priceStarting)
        .images([new builder.CardImage().url(hotel.image)])
        .buttons([
            new builder.CardAction()
                .title('More details')
                .type('openUrl')
                .value('https://www.bing.com/search?q=hotels+in+' + encodeURIComponent(hotel.location))
        ]);
}

function reviewAsAttachment(review) {
    return new builder.ThumbnailCard()
        .title(review.title)
        .text(review.text)
        .images([new builder.CardImage().url(review.image)]);
}