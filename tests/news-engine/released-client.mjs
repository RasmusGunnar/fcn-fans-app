import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const esbuild=require(process.env.ESBUILD_PATH||'C:/Users/rasmu/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/esbuild');
const commit='005c5d43a1bf71e1fbd2bc82ce89bafd73cae48f';
const source=execFileSync('git',['show',commit+':src/services/newsApi.ts'],{encoding:'utf8'});
const published=JSON.parse(readFileSync((process.env.NEWS_WEB_WORKTREE||'C:/Dev/fcn-fans-web-news-intake-recovery')+'/artifacts/news-engine/published-fixture.json','utf8'));
const rows=['article','social','podcast','video'].map((format,i)=>({...published,id:i?('11111111-1111-4111-8111-11111111111'+i):published.id,engine_metadata:{...published.engine_metadata,format}}));
let selection;
const query={select(s){selection=s;return this},order(){return this},limit(){return Promise.resolve({data:rows,error:null})}};
const context={exports:{},console,URL,setTimeout,clearTimeout,require(name){
 if(name.endsWith('/supabase'))return {supabase:{from(table){assert.equal(table,'news_items');return query}}};
 if(name.endsWith('/logger'))return {logger:{log(){},warn(){},error(){}}};
 if(name.endsWith('/fixEncoding'))return {fixEncoding:x=>x};
 if(name.endsWith('/newsMedia'))return {sanitizeNewsHeroImageUrl:x=>x};
 throw Error('Unexpected released-client dependency: '+name);
}};context.module={exports:context.exports};
vm.runInNewContext(esbuild.transformSync(source,{loader:'ts',format:'cjs'}).code,context);
const mapped=await context.module.exports.fetchNewsItems();
assert.equal(selection,'*');assert.equal(mapped.length,4);
for(let i=0;i<4;i++){assert.equal(mapped[i].id,rows[i].id);assert.equal(mapped[i].url,rows[i].url);assert.equal(mapped[i].description,rows[i].summary||rows[i].description);assert.equal(mapped[i].engineMetadata,undefined);}
const result={sourceCommit:commit,rows:4,sqlPublishedId:published.id,legacyMapper:'PASS',transport:'fixture',physicalDevice:'NOT_RUN',storeBuildIdentity:'EAS iOS 76 / Android 3; binary-to-store linkage not independently attested'};
writeFileSync('artifacts/news-engine/released-client.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
