

Message Archituctural Decisions - 

Messages Flow :
Each message that is being sent, wether it is a followup, a client message, an edge client message or a business member emssage 
must be go through the message worker service.
This service is the only service that has previliges of updating part of the DB. 
The relations that this service is the owner are:
Conversation
Message
Client

Every message is inserted into the service with a flag that indicates the API service that it needs to do.
For example, edge client message is different then business member, and a followup message has different logic then both of them.
This service collects all of the message processing logic and since the core logic is the same for all of them especially on the DB 
we include them together in one DB.

After the message is processed, all of the messages are sent to the outbound worker that resolves the provider messages by the identifiers recivied from the API
and sends the message to the relevant recievers.

Credentials Flow:
Each business member sign his own credentials. Those credentials are set on the user onboarding process, mainly from twilio.
After that, the user credentials are save encrypted in the DB in the ChannelProvider realtion.
When ever a message has entered, twilio (or any other provider) sends general details about the business that recieved a message.
It could be a phone number, instagram user id or a page id. When the message arrives the API resolve the reciever and sends the data to the message service.
When the message entered the outbound worker, we get the encrypted credentials from the DB, decrypt them and use them to initalize to correct provider class.

This decision was made to enable different businesses to use different providers and different systems to send and receive messages. 
It was also made to concentrate all of the third party logic in one concentrated place instead of injecting it into the messages worker.

