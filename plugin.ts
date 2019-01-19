const through2 = require('through2')
import Vinyl from 'vinyl'
const split = require('split')
import PluginError = require('plugin-error');
import { start } from 'repl';

// consts
const PLUGIN_NAME = 'gulp-datatube-handlelines';

export type TransformCallback = (lineObj: Object,self:any) => Object | null
export type FinishFunction = (self:any,file:Vinyl) => any
export type StartFunction = () => any
export type allCallbacks = {
  transformCallback?: TransformCallback,
  finishFunction?: FinishFunction,
  startFunction?: StartFunction
}

/* This is a model data.tube plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ),
but with an additional feature: it accepts a configObj as its first parameter */
export function handler(configObj: any, newHandlers?: allCallbacks) {
  let propsToAdd = configObj.propsToAdd

  // handleLine could be the only needed piece to be replaced for most dataTube plugins
  const defaultHandleLine = (lineObj: Object): Object | null => {
    for (let propName in propsToAdd) {
      (lineObj as any)[propName] = propsToAdd[propName]
    }
    return lineObj
  }
  const defaultFinishHandler = () => {
    console.log("The handler has officially ended!");
  }
  const defaultStartHandler = () => {
    console.log("The handler has officially started!");
  }

  let handleLine: TransformCallback = defaultHandleLine;
  let finishHandler: FinishFunction = defaultFinishHandler;
  let startHandler: StartFunction = defaultStartHandler;
  if (newHandlers) {
    handleLine = newHandlers.transformCallback ? newHandlers.transformCallback : defaultHandleLine
    finishHandler = newHandlers.finishFunction ? newHandlers.finishFunction : defaultFinishHandler
    startHandler = newHandlers.startFunction ? newHandlers.startFunction : defaultStartHandler
  }

  //let transformer = through2.obj(); // new transform stream, in object mode
  // since we're in object mode, dataLine comes as a string. Since we're counting on split
  // to have already been called upstream, dataLine will be a single line at a time
  // transformer._transform = function (dataLine: string, encoding: string, callback: Function) {
  //   let returnErr: any = null
  //   try {
  //     let dataObj
  //     if (dataLine.trim() != "") dataObj = JSON.parse(dataLine)
  //     let handledObj = handleLine(dataObj)
  //     if (handledObj) {
  //       let handledLine = JSON.stringify(handledObj)
  //       console.log(handledLine)
  //       this.push(handledLine + '\n');
  //     }
  //   } catch (err) {
  //     returnErr = new PluginError(PLUGIN_NAME, err);
  //   }

  //   callback(returnErr)
  // }

  // creating a stream through which each file will pass
  // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
  const strm = through2.obj(function (this: any, file: Vinyl, encoding: string, cb: Function) {
    const self = this
    let returnErr: any = null

    if (file.isNull()) {
      // return empty file
      return cb(returnErr, file)
    }
    else if (file.isBuffer()) {
      // strArray will hold file.contents, split into lines
      const strArray = (file.contents as Buffer).toString().split(/\r?\n/)
      let tempLine: any

      // we'll call handleLine on each line
      for (let dataIdx in strArray) {
        try {
          let lineObj;
          if (strArray[dataIdx].trim() != "") lineObj = JSON.parse(strArray[dataIdx]);
          tempLine = handleLine(lineObj, self)
          if (tempLine) strArray[dataIdx] = JSON.stringify(tempLine)
          else strArray.splice(Number(dataIdx), 1) // remove the array item if handleLine returned null
        } catch (err) {
          returnErr = new PluginError(PLUGIN_NAME, err);
        }
      }
      let data = strArray.join('\n')
      console.log(data)
      file.contents = new Buffer(data)

      finishHandler(self,file);
      // send the transformed file through to the next gulp plugin, and tell the stream engine that we're done with this file
      cb(returnErr)
    }
    else if (file.isStream()) {
      file.contents
        // split plugin will split the file into lines
        .pipe(split())
        // our transformer stream, created above, will deal with each line using handleLine
        //.pipe(transformer)
        .on('data', function(chunk:any){
          let dataLine = chunk;
          let dataObj;
          if (dataLine.trim() != "") dataObj = JSON.parse(dataLine)
          handleLine(dataObj,self)
        })
        .on('end', function(){
          
          console.log('END');
          cb(returnErr)
        })
        .on('finish', function () {
          // using finish event here instead of end since this is a Transform stream   https://nodejs.org/api/stream.html#stream_events_finish_and_end

          // send the transformed file goes through to the next gulp plugin
          self.push(file)

          //call endHandler() to finish up the plugin 
          //finishHandler();

          console.log('finished')
          // tell the stream engine that we are done with this file
          cb(returnErr);
        })
        .on('error', function (err: any) {
          //console.error(err)
          cb(new PluginError(PLUGIN_NAME, err))
        })
    }

  })

  startHandler();
  return strm
}