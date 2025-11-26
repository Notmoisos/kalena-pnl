const { beforeUserCreated, beforeUserSignedIn } = require('firebase-functions/v2/identity');
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

// Only allow @kalenafoods.com.br and @hakkoo.ai emails
const isAllowedDomain = (email) =>
  email && (email.endsWith('@kalenafoods.com.br') || email.endsWith('@hakkoo.ai'));

exports.beforeCreateUserFn = beforeUserCreated((event) => {
  const user = event.data;
  if (!isAllowedDomain(user.email)) {
    throw new HttpsError('invalid-argument', `Unauthorized email "${user.email}"`);
  }
});

exports.beforeSignInUserFn = beforeUserSignedIn((event) => {
  const user = event.data;
  if (!isAllowedDomain(user.email)) {
    throw new HttpsError('permission-denied', `Unauthorized email "${user.email}"`);
  }
}); 