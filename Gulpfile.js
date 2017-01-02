var plumber = require("gulp-plumber");
var through = require("through2");
var chalk   = require("chalk");
var newer   = require("gulp-newer");
var babel   = require("gulp-babel");
var watch   = require("gulp-watch");
var gutil   = require("gulp-util");
var gulp    = require("gulp");
var path    = require("path");

var scripts = "./packages/*/src/**/*.js";

var srcEx, libFragment;

if (path.win32 === path) {
  srcEx = /(packages\\[^\\]+)\\src\\/;
  libFragment = "$1\\lib\\";
} else {
  srcEx = new RegExp("(packages/[^/]+)/src/");
  libFragment = "$1/lib/";
}

var mapToDest = function (path) { return path.replace(srcEx, libFragment); };
var dest = "packages";

gulp.task("default", ["build"]);

gulp.task("build", function () {
  return gulp.src(scripts)
    .pipe(plumber({
      errorHandler: function (err) {
        gutil.log(err.stack);
      }
    }))
    .pipe(newer({map: mapToDest}))
    .pipe(through.obj(function (file, enc, callback) {
      gutil.log("Compiling", "'" + chalk.cyan(file.path) + "'...");
      callback(null, file);
    }))
    .pipe(babel())
    .pipe(through.obj(function (file, enc, callback) {
      file._path = file.path;
      file.path = mapToDest(file.path);
      callback(null, file);
    }))
    .pipe(gulp.dest(dest));
});

// TODO: remove this section
// temporarily just copying the old code since watch isn't working
var dest = "packages";
gulp.task("build-watch", function () {
  return gulp.src(scripts)
    .pipe(plumber({
      errorHandler: function (err) {
        gutil.log(err.stack);
      }
    }))
    .pipe(through.obj(function (file, enc, callback) {
      file._path = file.path;
      file.path = file.path.replace(srcEx, libFragment);
      callback(null, file);
    }))
    .pipe(newer(dest))
    .pipe(through.obj(function (file, enc, callback) {
      gutil.log("Compiling", "'" + chalk.cyan(file._path) + "'...");
      callback(null, file);
    }))
    .pipe(babel())
    .pipe(gulp.dest(dest));
});

gulp.task("watch", ["build-watch"], function (callback) {
  watch(scripts, {debounceDelay: 200}, function () {
    gulp.start("build-watch");
  });
});

// Adds an 'index.js.flow' file next to each file that Lerna creates in node_modules.
gulp.task("bootstrap-flow", function() {
  const NO_INDEX_TYPES = new Set(["babel-runtime", "babel-register", "babel-core"]);

  return gulp.src("./packages/babel-*/node_modules/babel-*/index.js", {read: false, base: __dirname})
    .pipe(through.obj(function (file, enc, callback) {
      const name = file.path.match(/node_modules\/(babel-[^/]+)\/index\.js/)[1];
      const target = "../../../" + name + "/src";

      file.path += ".flow";

      if (NO_INDEX_TYPES.has(name)) {
        file.contents = new Buffer("");
      } else {
        file.contents = new Buffer([
          "// @flow",
          "export {default} from \"" + target + "\";",
          "export * from \"" + target + "\";",
        ].join("\n") + "\n");
      }

      callback(null, file);
    }))
    .pipe(gulp.dest("./"));
});
