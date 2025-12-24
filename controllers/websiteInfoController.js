import WebsiteInfo from "../models/wesiteInfoModel.js";
import { HTTP_STATUS_200 } from "../utils/constants.js";
import { sendResponse } from "../utils/helper.js";

export const addWebsiteInfo = async (req, res) => {
  try {
    const { content } = req.body;

    // Check if a Terms and Conditions document already exists
    const existing = await WebsiteInfo.findOne({status: "Active"});

    let termsAndConditions;

    if (existing) {
      // Update the existing document
      existing.content = content;
      termsAndConditions = await existing.save();
    } else {
      // Create a new document
      termsAndConditions = await WebsiteInfo.create({ content });
    }

    sendResponse(res, HTTP_STATUS_200, "Terms and conditions saved", termsAndConditions);
  } catch (error) {
    console.log(error);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};


export const getWebsiteInfo = async (req, res) => {
  try {
    const DEFAULT_LANG = req.headers["accept-language"] ? req.headers["accept-language"] : 'en';
    const languageField = DEFAULT_LANG === "ar" ? "contentArabic" : "contentEnglish";

    // Include fields you want, without mixing inclusion/exclusion except for `_id`
    const termsAndConditions = await WebsiteInfo.findOne(
      { status: "Active" }
    ).select(`-_id -status `);

    sendResponse(res, HTTP_STATUS_200, "Terms and conditions retrived",termsAndConditions);

  } catch (error) {
    console.log(error);
    sendResponse(res, HTTP_STATUS_200, "Internal Server Error");
  }
}