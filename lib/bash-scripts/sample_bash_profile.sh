echo ‘new terminal’

export PATH=${PATH}:/usr/local/mlcp/bin

#export PATH=“$PATH:$HOME/tmp”





# Setting PATH for Python 2.7
# The orginal version is saved in .bash_profile.pysave
PATH="/Library/Frameworks/Python.framework/Versions/2.7/bin:${PATH}"
export PATH

export AWS_KEY="AKIAITWNTJATR6DZY76Q"
export AWS_SECRET="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"
export REDIS_URL="redis://:msopUyO5umNU0Li9@pub-redis-14478.us-east-1-4.4.ec2.garantiadata.com:14478"
export NVM_DIR="/Users/lneves/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
PATH=/usr/local/gradle/gradle-2.13/bin:/Library/Frameworks/Python.framework/Versions/2.7/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/mlcp/bin
eval export PATH="/Users/lneves/.rbenv/shims:${PATH}"
export RBENV_SHELL=bash
source '/usr/local/Cellar/rbenv/1.0.0/libexec/../completions/rbenv.bash'
command rbenv rehash 2>/dev/null
rbenv() {
  local command
  command="$1"
  if [ "$#" -gt 0 ]; then
    shift
  fi

  case "$command" in
  rehash|shell)
    eval "$(rbenv "sh-$command" "$@")";;
  *)
    command rbenv "$command" "$@";;
  esac
}

# The next line updates PATH for the Google Cloud SDK.
if [ -f /Users/lneves/google-cloud-sdk/path.bash.inc ]; then
  source '/Users/lneves/google-cloud-sdk/path.bash.inc'
fi

# The next line enables shell command completion for gcloud.
if [ -f /Users/lneves/google-cloud-sdk/completion.bash.inc ]; then
  source '/Users/lneves/google-cloud-sdk/completion.bash.inc'
fi

# Setting PATH for Python 3.5
# The original version is saved in .bash_profile.pysave
PATH="/Library/Frameworks/Python.framework/Versions/3.5/bin:${PATH}"
export PATH

# added by Anaconda2 4.2.0 installer
export PATH="/Users/lneves/anaconda/bin:$PATH"


source ~/.nighthawk/record-console.sh
