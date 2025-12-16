package it.unina.bugboard26.backend.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@Controller
public class SpaController {

    @RequestMapping(
            value = {"/", "/{path:[^\\.]*}", "/**/{path:[^\\.]*}"},
            method = {RequestMethod.GET, RequestMethod.HEAD}
    )
    public String forward() {
        return "forward:/index.html";
    }
}
