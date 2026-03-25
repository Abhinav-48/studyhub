[1mdiff --git a/server.js b/server.js[m
[1mindex 31612f2..e15146a 100644[m
[1m--- a/server.js[m
[1m+++ b/server.js[m
[36m@@ -364,10 +364,5 @@[m [mfunction formatReply(r) {[m
 [m
 server.listen(PORT, () => {[m
   console.log(`\n🚀 StudyHub running at http://localhost:${PORT}`);[m
[31m-<<<<<<< Updated upstream[m
[31m-  console.log(`👑 Admin: "${ADMIN_NAME}" | Cloudinary + Supabase connected`);[m
[31m-});[m
[31m-=======[m
   console.log(`👑 Admin: "${ADMIN_NAME}"`);[m
 });[m
[31m->>>>>>> Stashed changes[m
