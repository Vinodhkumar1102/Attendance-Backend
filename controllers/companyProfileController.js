const CompanyProfile = require('../models/CompanyProfile');

const getCompanyProfile = async (request, response) => {
  try {
    const profile = await CompanyProfile.findOne({profileKey: 'default'});
    return response.json(profile || {
      companyName: '',
      description: '',
      managerName: '',
      email: '',
      phone: '',
      address: '',
      website: '',
      aboutHeading: '',
      about: '',
      avatar: null,
    });
  } catch (error) {
    return response.status(500).json({message: 'Unable to fetch company profile'});
  }
};

const updateCompanyProfile = async (request, response) => {
  try {
    const update = {
      companyName: request.body.companyName?.trim() || '',
      description: request.body.description?.trim() || '',
      managerName: request.body.managerName?.trim() || '',
      email: request.body.email?.trim().toLowerCase() || '',
      phone: request.body.phone?.trim() || '',
      address: request.body.address?.trim() || '',
      website: request.body.website?.trim() || '',
      aboutHeading: request.body.aboutHeading?.trim() || '',
      about: request.body.about?.trim() || '',
      aboutSecondaryDescription: request.body.aboutSecondaryDescription?.trim() || '',
      aboutPoints: request.body.aboutPoints ? JSON.parse(request.body.aboutPoints) : ['', '', '', ''],
    };

    if (request.file) {
      update.avatar = {
        originalName: request.file.originalname,
        fileName: request.file.filename,
        path: `/uploads/company/${request.file.filename}`,
        mimeType: request.file.mimetype,
        size: request.file.size,
      };
    }

    const profile = await CompanyProfile.findOneAndUpdate(
      {profileKey: 'default'},
      {$set: update},
      {new: true, upsert: true, setDefaultsOnInsert: true},
    );

    return response.json(profile);
  } catch (error) {
    return response.status(500).json({message: 'Unable to save company profile'});
  }
};

module.exports = {getCompanyProfile, updateCompanyProfile};