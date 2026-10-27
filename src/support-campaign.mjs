import campaign from "#parameters/data/records/marketing/open-work-campaign.json" with { type: "json" };
import { validateSupportCampaign, campaignSharePack as sharePack, supportResponse as respond } from "./support-campaign-core.mjs";
validateSupportCampaign(campaign);
const campaignSharePack = (c=campaign)=>sharePack(c);
const supportResponse = (request,c=campaign)=>respond(request,c);
export { campaign, validateSupportCampaign, campaignSharePack, supportResponse };
