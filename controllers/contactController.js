const Contact = require('../models/Contact');

const getContact = async (request, response) => {
  try {
    const contact = await Contact.findOne({contactKey: 'default'});
    if (!contact) {
      return response.json({phone: '', email: '', address: '', question: '', paragraph: '', faqs: []});
    }

    const result = contact.toObject();
    result.faqs = result.faqs?.length
      ? result.faqs
      : result.question || result.paragraph
        ? [{question: result.question || '', paragraph: result.paragraph || ''}]
        : [];
    return response.json(result);
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch contact details'});
  }
};

const updateContact = async (request, response) => {
  try {
    const fields = {};
    if (Object.prototype.hasOwnProperty.call(request.body, 'phone')) fields.phone = request.body.phone?.trim() || '';
    if (Object.prototype.hasOwnProperty.call(request.body, 'email')) fields.email = request.body.email?.trim().toLowerCase() || '';
    if (Object.prototype.hasOwnProperty.call(request.body, 'address')) fields.address = request.body.address?.trim() || '';
    if (Object.prototype.hasOwnProperty.call(request.body, 'question')) fields.question = request.body.question?.trim() || '';
    if (Object.prototype.hasOwnProperty.call(request.body, 'paragraph')) fields.paragraph = request.body.paragraph?.trim() || '';
    if (Object.prototype.hasOwnProperty.call(request.body, 'faqs')) {
      fields.faqs = Array.isArray(request.body.faqs)
        ? request.body.faqs.map(faq => ({
          question: faq.question?.trim() || '',
          paragraph: faq.paragraph?.trim() || '',
        }))
        : [];
      fields.question = fields.faqs[0]?.question || '';
      fields.paragraph = fields.faqs[0]?.paragraph || '';
    }

    const contact = await Contact.findOneAndUpdate(
      {contactKey: 'default'},
      {$set: fields},
      {new: true, upsert: true, setDefaultsOnInsert: true},
    );

    return response.json(contact);
  } catch (error) {
    return response.status(500).json({message: 'Unable to update contact details'});
  }
};

module.exports = {getContact, updateContact};
