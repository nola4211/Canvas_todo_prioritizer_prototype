const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('index.html','utf8');
const admin=fs.readFileSync('admin.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-users/index.ts','utf8');

assert.match(app,/assets\/student-planner\.svg/);
assert.match(app,/>Assignments</);
assert.doesNotMatch(app,/data-view="home"[^>]*>[^<]*Maintain Records/);
assert.match(app,/id="maintain-users-menu"[^>]*hidden/);
assert.match(admin,/>Maintain Users</);
assert.match(admin,/>Maintain Records</);
assert.match(admin,/Back to student sign in/);
assert.match(admin,/await db\.auth\.signOut\(\);location\.href='index\.html'/);
assert.match(edge,/app_metadata\?\.role!=='admin'/);
assert.match(edge,/auth\.admin\.listUsers/);
assert.match(edge,/auth\.admin\.createUser/);
assert.match(edge,/auth\.admin\.updateUserById/);
assert.match(edge,/auth\.admin\.deleteUser/);
assert.doesNotMatch(app,/SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(admin,/SUPABASE_SERVICE_ROLE_KEY/);
console.log('PASS: landing image, protected maintenance controls, user CRUD, record link, and safe return to student sign-in.');
