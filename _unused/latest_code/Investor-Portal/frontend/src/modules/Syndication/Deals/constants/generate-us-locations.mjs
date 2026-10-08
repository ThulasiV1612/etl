/**
 * One-time / regen: node generate-us-locations.mjs → writes us-locations.json
 * Pipe format: CODE|Name|City1,City2,City3,...
 */
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const rows = `
AL|Alabama|Birmingham,Montgomery,Mobile,Huntsville,Tuscaloosa,Hoover
AK|Alaska|Anchorage,Fairbanks,Juneau,Wasilla,Sitka,Ketchikan
AZ|Arizona|Phoenix,Tucson,Mesa,Chandler,Scottsdale,Gilbert
AR|Arkansas|Little Rock,Fort Smith,Fayetteville,Springdale,Jonesboro,Rogers
CA|California|Los Angeles,San Diego,San Jose,San Francisco,Fresno,Sacramento
CO|Colorado|Denver,Colorado Springs,Aurora,Fort Collins,Lakewood,Thornton
CT|Connecticut|Bridgeport,New Haven,Hartford,Stamford,Waterbury,Norwalk
DE|Delaware|Wilmington,Dover,Newark,Middletown,Smyrna,Milford
DC|District of Columbia|Washington
FL|Florida|Jacksonville,Miami,Tampa,Orlando,St. Petersburg,Hialeah
GA|Georgia|Atlanta,Augusta,Columbus,Savannah,Athens,Sandy Springs
HI|Hawaii|Honolulu,Hilo,Kailua,Kaneohe,Kahului,Kailua-Kona
ID|Idaho|Boise,Meridian,Nampa,Idaho Falls,Pocatello,Caldwell
IL|Illinois|Chicago,Aurora,Naperville,Joliet,Rockford,Elgin
IN|Indiana|Indianapolis,Fort Wayne,Evansville,South Bend,Carmel,Bloomington
IA|Iowa|Des Moines,Cedar Rapids,Davenport,Sioux City,Iowa City,Waterloo
KS|Kansas|Wichita,Overland Park,Kansas City,Olathe,Topeka,Lawrence
KY|Kentucky|Louisville,Lexington,Bowling Green,Owensboro,Covington,Hopkinsville
LA|Louisiana|New Orleans,Baton Rouge,Shreveport,Lafayette,Lake Charles,Kenner
ME|Maine|Portland,Lewiston,Bangor,South Portland,Auburn,Augusta
MD|Maryland|Baltimore,Frederick,Rockville,Gaithersburg,Bowie,Hagerstown
MA|Massachusetts|Boston,Worcester,Springfield,Cambridge,Lowell,New Bedford
MI|Michigan|Detroit,Grand Rapids,Warren,Sterling Heights,Lansing,Ann Arbor
MN|Minnesota|Minneapolis,Saint Paul,Rochester,Duluth,Bloomington,Plymouth
MS|Mississippi|Jackson,Gulfport,Southaven,Hattiesburg,Biloxi,Meridian
MO|Missouri|Kansas City,Saint Louis,Springfield,Columbia,Independence,Lee's Summit
MT|Montana|Billings,Missoula,Great Falls,Bozeman,Butte,Helena
NE|Nebraska|Omaha,Lincoln,Bellevue,Grand Island,Kearney,Fremont
NV|Nevada|Las Vegas,Henderson,Reno,North Las Vegas,Sparks,Carson City
NH|New Hampshire|Manchester,Nashua,Concord,Dover,Rochester,Keene
NJ|New Jersey|Newark,Jersey City,Paterson,Elizabeth,Edison,Lakewood
NM|New Mexico|Albuquerque,Las Cruces,Rio Rancho,Santa Fe,Roswell,Farmington
NY|New York|New York City,Buffalo,Rochester,Yonkers,Syracuse,Albany
NC|North Carolina|Charlotte,Raleigh,Greensboro,Durham,Winston-Salem,Fayetteville
ND|North Dakota|Fargo,Bismarck,Grand Forks,Minot,West Fargo,Williston
OH|Ohio|Columbus,Cleveland,Cincinnati,Toledo,Akron,Dayton
OK|Oklahoma|Oklahoma City,Tulsa,Norman,Broken Arrow,Edmond,Lawton
OR|Oregon|Portland,Salem,Eugene,Gresham,Hillsboro,Bend
PA|Pennsylvania|Philadelphia,Pittsburgh,Allentown,Erie,Reading,Scranton
RI|Rhode Island|Providence,Warwick,Cranston,Pawtucket,East Providence,Woonsocket
SC|South Carolina|Charleston,Columbia,North Charleston,Mount Pleasant,Rock Hill,Greenville
SD|South Dakota|Sioux Falls,Rapid City,Aberdeen,Brookings,Watertown,Mitchell
TN|Tennessee|Nashville,Memphis,Knoxville,Chattanooga,Clarksville,Murfreesboro
TX|Texas|Houston,San Antonio,Dallas,Austin,Fort Worth,El Paso
UT|Utah|Salt Lake City,West Valley City,Provo,West Jordan,Orem,Sandy
VT|Vermont|Burlington,South Burlington,Rutland,Barre,Montpelier,St. Albans
VA|Virginia|Virginia Beach,Norfolk,Chesapeake,Richmond,Newport News,Alexandria
WA|Washington|Seattle,Spokane,Tacoma,Vancouver,Bellevue,Everett
WV|West Virginia|Charleston,Huntington,Morgantown,Parkersburg,Wheeling,Weirton
WI|Wisconsin|Milwaukee,Madison,Green Bay,Kenosha,Racine,Appleton
WY|Wyoming|Cheyenne,Casper,Laramie,Gillette,Rock Springs,Sheridan
`
  .trim()
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)

const states = rows.map((line) => {
  const [code, name, citiesPart] = line.split("|")
  const cities = citiesPart.split(",").map((c) => c.trim()).filter(Boolean)
  return { code: code.trim(), name: name.trim(), cities }
})

const out = {
  countryCode: "US",
  states,
}

const dest = join(__dirname, "us-locations.json")
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, "utf8")
console.log("Wrote", dest, "states:", states.length)
