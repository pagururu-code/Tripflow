export const hasLeadingEmoji = (value = '') => /^\s*\p{Extended_Pictographic}/u.test(value);

export const placeEmoji = (title = '', placeType = '') => {
  const value = `${title} ${placeType}`.toLocaleLowerCase();
  if (/(cafe|coffee|bakery|dessert|카페|커피|베이커리|제과|디저트|喫茶|珈琲|パン|菓子)/i.test(value)) return '☕';
  if (/(bar|pub|night_club|liquor|술집|라이브 음악|居酒屋|バー|酒場)/i.test(value)) return '🍸';
  if (/(restaurant|food|meal|sushi|ramen|curry|음식점|식당|초밥|스시|소바|카레|야키니쿠|징기스칸|해산물|寿司|蕎麦|料理|焼肉|ラーメン|カレー|鮮魚|ハンバーグ)/i.test(value)) return '🍽️';
  if (/(shopping|store|mall|market|department|supermarket|convenience|쇼핑|상점|시장|백화점|마트|편의점|돈키호테|파르코|다이마루|ロフト|マルシェ|市場|百貨店|商店|コンビニ)/i.test(value)) return '🛍️';
  if (/(park|garden|공원|정원|公園|庭園)/i.test(value)) return '🌿';
  if (/(museum|university|temple|shrine|historic|박물관|대학교|신사|사찰|오르골|大学|博物館|神社|寺|歴史)/i.test(value)) return '🏛️';
  if (/(hotel|lodging|숙소|호텔|ホテル|旅館)/i.test(value)) return '🏨';
  if (/(station|airport|transit|역|공항|駅|空港)/i.test(value)) return '🚉';
  if (/(spa|hot_spring|온천|스파|温泉|銭湯)/i.test(value)) return '♨️';
  return '📍';
};
