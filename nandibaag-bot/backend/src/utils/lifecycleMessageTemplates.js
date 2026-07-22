/**
 * Lifecycle message templates for booking-related automated messages
 * 
 * Used by lifecycleMessageCron.js for:
 * - checkin_reminder: sent morning of check-in date
 * - checkout_message: sent morning of check-out date
 * - review_request: sent evening of check-out date (only if checked out, not no-show)
 * 
 * Messages are designed to be:
 * - Warm and professional
 * - 2-3 lines each
 * - Culturally appropriate for each language
 * - Matching the tone of existing followUpTemplates.js
 */

const LOCATION_URL = 'https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA';

/**
 * Gets the appropriate lifecycle message for a given type and language
 * 
 * @param {string} messageType - 'checkin_reminder' | 'checkout_message' | 'review_request'
 * @param {string} language - 'hindi' | 'marathi' | 'english' | 'hinglish' | 'gujarati'
 * @param {string} guestName - Guest's name (optional, for personalization)
 * @returns {string} Lifecycle message
 */
function getLifecycleMessage(messageType, language, guestName = null) {
  const greeting = guestName ? `Namaste ${guestName} ji! ` : 'Namaste! ';

  const templates = {
    'checkin_reminder': {
      hindi: `${greeting}Aaj aapka check-in hai Nandibaag Resort mein 😊 Check-in time 12:00 PM se hai. Location: ${LOCATION_URL} Milte hain! 🙏`,
      marathi: `${greeting}आज तुमचे नंदीबाग रिसॉर्टमध्ये चेक-इन आहे 😊 चेक-इन वेळ दुपारी 12:00 वाजता. स्थान: ${LOCATION_URL} भेटूया! 🙏`,
      english: `${greeting}Your check-in at Nandibaag Resort is today 😊 Check-in time is from 12:00 PM. Location: ${LOCATION_URL} See you soon! 🙏`,
      hinglish: `${greeting}Aaj aapka check-in hai Nandibaag Resort mein 😊 Check-in time 12:00 PM se hai. Location: ${LOCATION_URL} Milte hain! 🙏`,
      gujarati: `${greeting}આજે નંદીબાગ રિસોર્ટમાં તમારું ચેક-ઇન છે 😊 ચેક-ઇન સમય બપોરે 12:00 વાગ્યાથી. સ્થાન: ${LOCATION_URL} મળીએ! 🙏`
    },
    'checkout_message': {
      hindi: `${greeting}Aaj checkout day hai, 10:30 AM tak room khali karna hai 😊 Umeed hai aapka stay accha raha!`,
      marathi: `${greeting}आज चेक-आउट दिवस आहे, 10:30 AM पर्यंत रूम रिकामी करायची आहे 😊 आशा आहे तुमचा मुक्काम छान होता!`,
      english: `${greeting}Today is checkout day, room needs to be vacated by 10:30 AM 😊 Hope you had a wonderful stay!`,
      hinglish: `${greeting}Aaj checkout day hai, 10:30 AM tak room khali karna hai 😊 Umeed hai aapka stay accha raha!`,
      gujarati: `${greeting}આજે ચેક-આઉટનો દિવસ છે, 10:30 AM સુધીમાં રૂમ ખાલી કરવાનો છે 😊 આશા છે તમારો રોકાણ સરસ રહ્યો!`
    },
    'review_request': {
      hindi: `${greeting}Umeed hai Nandibaag mein aapka stay yaadgar raha 🙏 Agar 2 minute ho toh humein Google par ek review de dijiye, bahut madad milegi: ${LOCATION_URL} 🙏😊`,
      marathi: `${greeting}आशा आहे नंदीबागमधील तुमचा मुक्काम संस्मरणीय होता 🙏 2 मिनिटे असतील तर Google वर आम्हाला review द्या, खूप मदत होईल: ${LOCATION_URL} 🙏😊`,
      english: `${greeting}Hope your stay at Nandibaag was memorable 🙏 If you have 2 minutes, please leave us a Google review — it helps a lot: ${LOCATION_URL} 🙏😊`,
      hinglish: `${greeting}Umeed hai Nandibaag mein aapka stay yaadgar raha 🙏 Agar 2 minute ho toh humein Google par ek review de dijiye, bahut madad milegi: ${LOCATION_URL} 🙏😊`,
      gujarati: `${greeting}આશા છે નંદીબાગમાં તમારું રોકાણ યાદગાર હતું 🙏 2 મિનિટ હોય તો Google પર અમને review આપો, ખૂબ મદદ મળશે: ${LOCATION_URL} 🙏😊`
    }
  };

  const languageTemplates = templates[messageType] || templates['checkin_reminder'];
  const message = languageTemplates[language] || languageTemplates['hinglish'];

  return message;
}

module.exports = { getLifecycleMessage };
