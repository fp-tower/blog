function fileClosure() {
  
  const body = document.documentElement;
  
  function elem(selector, context = document){
    let elem = context.querySelector(selector);
    return elem != false ? elem : false;
  }
  
  function elems(selector) {
    let elems = document.querySelectorAll(selector);
    return elems.length ? elems : false; 
  }
  
  function pushClass(el, targetClass) {
    // equivalent to addClass
    if (el && typeof el == 'object' && targetClass) {
      elClass = el.classList;
      elClass.contains(targetClass) ? false : elClass.add(targetClass);
    }
  }
  
  function deleteClass(el, targetClass) {
    // equivalent to removeClass
    if (el && typeof el == 'object' && targetClass) {
      elClass = el.classList;
      elClass.contains(targetClass) ? elClass.remove(targetClass) : false;
    }
  }
  
  function modifyClass(el, targetClass) {
    // equivalent to toggleClass
    if (el && typeof el == 'object' && targetClass) {
      elClass = el.classList;
      elClass.contains(targetClass) ? elClass.remove(targetClass) : elClass.add(targetClass);
    }
  }
  
  function containsClass(el, targetClass) {
    if (el && typeof el == 'object' && targetClass) {
      return el.classList.contains(targetClass) ? true : false;
    }
  }
  
  function wrap(el, wrapper) {
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }
  
  function purgeEmptyElements(element) {
    let emptyElements = elems(element);
    if(emptyElements) {
      emptyElements.forEach(function(emptyElement){
        let content = emptyElement.innerHTML;
        if(content.length < 1) {
          emptyElement.parentNode.removeChild(emptyElement);
        }
      });
    }
  }
  
  purgeEmptyElements('p');
  
  function unwrapElements(target) {
    // element parameter represents the item wrapped in a paragraph
    let elements = document.querySelectorAll(`.${target}`);
    if(elements) {
      elements.forEach(function(el){
        let parent = el.parentNode.tagName === 'P'? el.parentNode : false;
        let children = el.parentNode.children;
        if(children.length === 1 && parent) {
          if(containsClass(el, target)) {
            parent.insertAdjacentHTML('beforebegin', parent.innerHTML);
            parent.parentNode.removeChild(parent);
          }
        }
      });
    }
  }
  
  unwrapElements('button');
  
  (function updateDate() {
    let date, year, element;
    date = new Date();
    year = date.getFullYear();
    element = elem('.year');
    element ? (element.innerHTML = year) : false;
  })();
  
  (function toggleMenu() {
    let nav, toggle, toggled, open, target, menuStatus, out, brand, sticky;
    nav = elem('.nav');
    toggle = elem('.nav_toggle');
    brand = elem('.nav_brand')
    toggled = 'nav_toggled';
    open = 'nav_show';
    out = elem('main');
    sticky = 'sticky';
    
    
    function modifyMenu() {
      modifyClass(toggle, toggled);
      modifyClass(nav, open);
      modifyClass(brand, sticky);
    }
    
    body.addEventListener('click', function(event) {
      target = event.target;
      menuStatus = containsClass(nav, open);
      if(menuStatus) {
        target === toggle | target == out ? modifyMenu() : false;
      } else {
        target === toggle ? modifyMenu() : false;
      }
    });
    
  })();
  
  
  (function addShadowToNav(){
    let header, top, shadow;
    header = elem('.nav_header');
    shadow = 'nav_shadow';
    window.onscroll = function() {
      top = document.body.scrollTop > 50 || document.documentElement.scrollTop > 50; 
      (top && !containsClass(header, shadow)) ? modifyClass(header, shadow) : false;
      (!top && containsClass(header, shadow)) ? deleteClass(header, shadow) : false;
    };
  })();
  
  (function  showActiveParentLink(){
    let active, current, parent, sub;
    active = 'nav_active';
    sub = 'nav_subitem'
    current = elem(`.${active}`);
    parent = containsClass(current, sub) ? current.parentNode.parentNode.previousElementSibling : false;
    parent ? pushClass(parent, active) : false;
  })();
  
  body.addEventListener('click', function(event) {
    let target = event.target;
    let excerpt = '.excerpt';
    let isOnExcerpt = target.closest(excerpt);
    let isExcerpt = target.matches(excerpt) || isOnExcerpt;
    let isActualLink = target.matches('a');
    if(isExcerpt && !isActualLink) {
      excerpt = isOnExcerpt ? isOnExcerpt : target;
      let link = excerpt.dataset.link;
      let firstLink = elem('a', excerpt);
      firstLink.click();
    }
  });
  
  const tables = elems('table');
  if(tables) {
    tables.forEach(function(table) {
      let tableWrapper = document.createElement('div');
      let isUnderHighlight = table.closest('.highlight');
      if(!isUnderHighlight) {
        tableWrapper.className = 'scrollable';
        wrap(table, tableWrapper);
      }
    });
  }
  
  let fixed, nav, scroll;
  
  fixed = 'nav_fixed';
  scroll = 'nav_scroll';
  nav = elem('.nav_header');
  
  function animateNav() {
    !containsClass(nav, scroll) ? pushClass(nav, scroll) : false;
    setTimeout(function(){
      !containsClass(nav, fixed) ? pushClass(nav, fixed) : false;
    }, 500)
  }
  
  function restoreNav() {
    containsClass(nav, scroll) ? deleteClass(nav, scroll) : false;
    setTimeout(function(){
      containsClass(nav, fixed) ? deleteClass(nav, fixed) : false;
    }, 500)
  }
  
  // function fixNav() {
  //   window.addEventListener('scroll', function(e) {
  //     let position = window.scrollY;
  //     if (position > 200) {
  //       window.requestAnimationFrame(animateNav); 
  //     } else {
  //       window.requestAnimationFrame(restoreNav); 
  //     }
  //   });
  // }
  // nav ? fixNav() : false;
  
  const hero = elem('.hero');
  if(hero) {
    modifyClass(hero, 'hero_move');
  }
  
  // style next links in pagination
  (function nextLinksPagination(){
    const links = elems('.page-link');
    Array.from(links).filter(function(link){
      let label = link.getAttribute('aria-label');
      if(label) {
        if (label.toLowerCase() === "next" ||  label.toLowerCase() === "previous") {
          if (link != undefined) {
            return link;
          }
        }    
      }
    }).forEach(function(link, index){
      if (typeof link == 'object') {
        let innerEl =  link.firstElementChild;
        if (innerEl) {
          let label = link.getAttribute('aria-label');
          innerEl.textContent = label;
          link.style.width = 'auto';
          link.style.opacity = '0.7';
        }
        let outerEl = link.parentNode;
        
        if(containsClass(outerEl, 'disabled')) {
          let elToHide = outerEl.nextElementSibling;
          if(index !== 1) {
            elToHide = outerEl.previousElementSibling;
          }
          elToHide.style.display = 'none';
        }
      }
    });
  })();
  
  // submit form
  (function submitForm(){
    const contactForm = elem('#contactForm');
    if(contactForm) {
      $(function(){
        $("#contactForm").submit(function(e){
          e.preventDefault();
          var href = $(this).attr("action");
          $.ajax({
            type: "POST",
            dataType: "json",
            url: href,
            data: $(this).serialize(),
            success: function(response){
              if(response.status == "success"){
                alert("We received your submission, thank you!");
              }else{
                alert("An error occured: " + response.message);
              }
            }
          });
        });
      });
    }
  })()
}

window.addEventListener('load', fileClosure())
