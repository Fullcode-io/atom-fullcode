#!/bin/bash

LINE_TO_ADD="source ~/.nighthawk/record-console.sh"
# can't put in bashrc sometimes.... linux/permissions
BASHRC_PATH=$HOME/.bashrc
BASH_PROFILE_PATH=$HOME/.bash_profile

check_if_last_line()
{
  touch "$1"
  # check if this script is at bottom of profile
  tail -n 1 "$1" | grep -qsFx "$LINE_TO_ADD"
}

move_line_to_bottom()
{
    ex +g/record-console.sh/d -cwq "$1"
    printf "%s\n" "$LINE_TO_ADD" >> "$1"
    # if script line was moved to bottom then exit script since it will be called again later
    return
}

install_script() {
  check_if_last_line $1 || move_line_to_bottom $1
}

ask_to_start_tracking()
{
  read -p "Track Errors? Type 'y' or 'n'" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]
  then
    # save prompt here to reference later in sub-process via bashrc
    # export ORIGPS1=🐦 \ $PS1

    addMetadata() {
      x=0
      while IFS= read -r line; do
        ((x++))
        if [[ $x -eq 2 ]] || [[ $line == *"🐦"* ]] && [[ $line != *"$ exit"* ]]
        then
          # linux-gne also seems to do an extra script layer... not sure why
          PARENTPID=$(pgrep -P "$$" "script" | awk '{system("echo " $1)}')
          # # linux has an extra process layer for some reason
          pgrep -P "$PARENTPID" "script" && PARENTPID=$(pgrep -P "$PARENTPID" "script" | awk '{system("echo " $1)}')

          CHILDPID=$(pgrep -P "$PARENTPID" "bash" | awk '{system("echo " $1)}')
          # # TODO: pwdx solution for linux 
          CWD=$(lsof -p "$CHILDPID" | grep "cwd" | awk '{system("echo " $9)}')
          printf "%s\n" "current-cwd: $CWD/\r"
          x=0
        fi
        # printf "%s %s\n" "$(date)" "$line" | tr -cd '[:print:]\r\t\v\x2705'
        # printf "%s %s\n" "$(date +%s):" "$line" | tr -cd '[:print:]\r\t'
        printf "%s %s\n" "$(date +%s):" "$line"


        # printf "%s %s\n" "$(date)" "$line" | sed -e 's/[^A-Za-z0-9._-!?@#$%^&*()=+|{}<>,|`~"]/??/g'
      done >> $HOME/.nighthawk/logs/session.log
      # done >> $HOME/tmp/test.txt
        # echo "$line"
      # done
    }
    printf "%s\n" "Logging Terminal Session..."
    export ORIGPS1=$PS1
    # linux requires lowercase -f here
    [[ $OSTYPE == *"linux"* ]] && f=f || f=F
    script -a -q -$f >(addMetadata)
    # script -a -q -$f 2> >(tee /dev/null >&2 >(addMetadata))
    # exec 2> >(tee /dev/null >&2 >(addMetadata))
    # exec 2> >(addMetadata >&2)
    # exec 2> >(grep "" >&2)
    # exec 2>&1 | tee -a $HOME/tmp/test.txt
    # PS1=$ORIGPS1
  fi
}
# if script is not last line then move it to bottom and return
# check_if_last_line || move_line_to_bottom
install_script $BASHRC_PATH
install_script $BASH_PROFILE_PATH

if [[ $(ps -fp "$PPID" | grep "script -a -q -" || ps -fp "$PPID" | grep "bash -i") ]] 
  then
    # if we get here then we are in the new typescript session
    # remove source to this script then reload bash_profile to set everything back to "normal"
    ex +g/record-console.sh/d -cwq "$BASH_PROFILE_PATH"
    source ~/.bash_profile
    move_line_to_bottom $BASH_PROFILE_PATH
    PS1=🐦\ $ORIGPS1
    clear
  else 
    ask_to_start_tracking
fi
